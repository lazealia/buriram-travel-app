import { Controller, Get, Render, Param, Post, Body, Query } from '@nestjs/common';
import axios from 'axios';
import OpenAI from 'openai';
import { AppService } from './app.service';

@Controller()
export class AppController {
  private groq = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1"
  });

  constructor(private readonly appService: AppService) {}

private cache: { [key: string]: { data: any[], lastFetch: number } } = {
    news: { data: [], lastFetch: 0 },
    products: { data: [], lastFetch: 0 },
    accommodations: { data: [], lastFetch: 0 },
    restaurants: { data: [], lastFetch: 0 },
    routes: { data: [], lastFetch: 0 },
    activities: { data: [], lastFetch: 0 }
  };
  private readonly CACHE_TTL = 300 * 1000;

  private async getCachedData(key: string, url: string) {
    const now = Date.now();
    
    if (!this.cache[key]) {
      this.cache[key] = { data: [], lastFetch: 0 };
    }

    if (this.cache[key].data && this.cache[key].data.length > 0 && (now - this.cache[key].lastFetch) < this.CACHE_TTL) {
      return this.cache[key].data;
    }

    try {
      const response = await axios.get(url, { timeout: 10000 });
      let fetchedData = response.data?.data || response.data?.products || response.data;
      if (!fetchedData) fetchedData = [];
      if (!Array.isArray(fetchedData)) fetchedData = [fetchedData];
      this.cache[key] = { data: fetchedData, lastFetch: now };
      return fetchedData;
    } catch (error) {
      console.error(`Cache Error (${key}):`, error.message);
      return this.cache[key]?.data || [];
    }
  }
  
  @Post('api/chat')
  async handleChat(@Body('message') message: string) {
    const rawMsg = message?.trim() || '';
    if (!rawMsg) return { reply: "พิมพ์หาคุยกับน้องรุ้งได้เลยจ้า" };

    try {
      const searchKey = rawMsg.toLowerCase();
      
      const [products, accommodations, restaurants, routes] = await Promise.all([
        this.getCachedData('products', process.env.RCBT_PRODUCT_URL!),
        this.getCachedData('accommodations', process.env.RCBT_ACCOMMODATION_URL!),
        this.getCachedData('restaurants', process.env.RCBT_RESTAURANT_URL!),
        this.getCachedData('routes', process.env.RCBT_ROUTE_URL!)
      ]);

      const mP = products.find(p => p.serviceName?.toLowerCase().includes(searchKey));
      if (mP) {
        const img = mP.serviceImage || 'https://via.placeholder.com/300x200';
        return { 
          reply: `น้องรุ้งเจอ <b>${mP.serviceName}</b> จ้า!<br><br>` + 
          this.generateChatCard(img, `💰 ราคา: ${mP.servicePrice} บาท<br>📍 ${mP.serviceContact?.Location?.DistrictName || 'บุรีรัมย์'}`, `/shop?search=${mP.serviceName}`, "🛒 ดูสินค้า", "emerald-500") 
        };
      }

      const mA = accommodations.find(a => a.serviceName?.toLowerCase().includes(searchKey));
      if (mA) {
        const img = mA.serviceImage || mA.serviceImageCover || 'https://via.placeholder.com/300x200';
        return { 
          reply: `แนะนำที่พัก <b>${mA.serviceName}</b> ค่ะ!<br><br>` + 
          this.generateChatCard(img, `📍 ${mA.serviceContact?.Location?.DistrictName || 'บุรีรัมย์'}`, `/accommodation-detail/${mA.serviceId}`, "🏨 รายละเอียด", "blue-600") 
        };
      }

      const dfReply = await this.appService.detectIntent(rawMsg);
      
      if (dfReply && dfReply !== "I_DONT_KNOW" && dfReply !== "") {
        const combinedMsg = Array.isArray(dfReply) 
          ? dfReply.filter(m => m && m !== "I_DONT_KNOW").join('\n') 
          : dfReply;

        if (combinedMsg && combinedMsg !== "I_DONT_KNOW") {
          const formattedReply = this.linkify(combinedMsg);
          return { 
            reply: `<div class="bg-indigo-50 p-4 rounded-2xl border-l-4 border-indigo-500 text-indigo-800 shadow-sm text-sm whitespace-pre-line break-words">
                      ${formattedReply}
                    </div>` 
          };
        }
      }

      const chatCompletion = await this.groq.chat.completions.create({
        messages: [
          { role: "system", content: "คุณคือ 'น้องรุ้ง' AI นำเที่ยวบุรีรัมย์ ตอบเป็นภาษาไทย ร่าเริง มีหางเสียง คะ/ขา" },
          { role: "user", content: rawMsg }
        ],
        model: "moonshotai/kimi-k2-instruct",
        temperature: 0.3
      });

      return { reply: chatCompletion.choices[0].message.content };

    } catch (e) {
      console.error("Chat Error:", e);
      return { reply: "น้องรุ้งขอประมวลผลแป๊บนึงนะจ๊ะ ลองถามใหม่อีกทีจ้า" };
    }
  }

  private linkify(text: string): string {
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;
    return text.replace(urlRegex, (url) => {
      const href = url.toLowerCase().startsWith('http') ? url : `https://${url}`;
      return `<a href="${href}" target="_blank" class="text-blue-600 underline break-all font-medium hover:text-blue-800">${url}</a>`;
    });
  }

  private generateChatCard(img: string, sub: string, link: string, btn: string, color: string = "indigo-600") {
    const btnColor = color.includes('emerald') ? 'bg-emerald-500' : 
                     color.includes('blue') ? 'bg-blue-600' : 'bg-indigo-600';

    return `<div class="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm text-center">
              <div class="relative w-full h-40 mb-3">
                <img src="${img}" class="w-full h-full object-cover rounded-xl" 
                     onerror="this.src='https://via.placeholder.com/300x200';">
              </div>
              <p class="text-[11px] leading-relaxed text-gray-600 mb-3">${sub}</p>
              <a href="${link}" class="block w-full ${btnColor} text-white py-2.5 rounded-xl font-bold text-sm shadow-md active:scale-95 transition-transform">${btn}</a>
            </div>`;
  }

  @Get('/')
  @Render('index')
  async getIndex(@Query('search') search?: string) {
    let news = await this.getCachedData('news', process.env.NEWS_SHEET_URL!);
    if (search) news = news.filter(n => n.title?.toLowerCase().includes(search.toLowerCase()));
    return { currentPage: 'home', appName: 'Buriram Go', news };
  }

  @Get('/news/:id')
  @Render('news_detail')
  async getNewsDetail(@Param('id') id: string) {
    const news = await this.getCachedData('news', process.env.NEWS_SHEET_URL!);
    const item = news.find(n => String(n.id) === String(id));
    return { currentPage: 'home', appName: item?.title || 'ข่าวสาร', item };
  }

  @Get('places')
  @Render('places')
  async getPlaces() {
    try {
      const res = await axios.get(process.env.TAT_API_BASE_URL!, {
        params: { province_id: process.env.TAT_PROVINCE_ID, place_category_id: 3, limit: 100 },
        headers: { 'Accept-Language': 'th', 'x-api-key': process.env.TAT_API_KEY }
      });
      const places = (res.data.data || []).map(item => ({
        id: item.placeId, name: item.name, location: `อ.${item.location?.district?.name || ''} จ.บุรีรัมย์`,
        img: item.thumbnailUrl?.[0] || 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=500',
        coords: [parseFloat(item.latitude) || 14.993, parseFloat(item.longitude) || 103.102],
        description: item.introduction || 'คลิกเพื่อดูรายละเอียด'
      }));
      return { currentPage: 'places', appName: 'สถานที่ท่องเที่ยว', places };
    } catch (e) { return { currentPage: 'places', appName: 'สถานที่ท่องเที่ยว', places: [] }; }
  }

  @Get('detail/:id')
  @Render('detail')
  async getDetail(@Param('id') id: string) {
    try {
      const res = await axios.get(process.env.TAT_API_BASE_URL!, {
        params: { province_id: process.env.TAT_PROVINCE_ID, place_category_id: 3, limit: 100 },
        headers: { 'Accept-Language': 'th', 'x-api-key': process.env.TAT_API_KEY }
      });

      const item = res.data.data.find(p => p.placeId === id);

      if (!item) return { currentPage: 'home', place: null };

      return { 
        currentPage: 'home', 
        place: { 
          ...item, 
          name: item.placeName, // TAT ใช้ placeName
          img: item.thumbnailUrl && item.thumbnailUrl.length > 0 ? item.thumbnailUrl[0] : null,
          location: item.location?.address || 'ไม่ทราบที่อยู่',
          description: item.introduction || 'ไม่มีรายละเอียดจ้า',
          price: item.priceRange || 'เข้าชมฟรี/ไม่ระบุ',
          coords: [item.latitude, item.longitude] 
        } 
      };
    } catch (e) { 
      console.error('TAT API Error:', e.message);
      return { currentPage: 'home', place: null }; 
    }
  }

  @Get('services')
  @Render('services')
  getServices() { return { currentPage: 'services', appName: 'บริการนักท่องเที่ยว' }; }

  @Get('accommodations')
  @Render('accommodations')
  async getAccommodations(@Query('search') s?: string) {
    let data = await this.getCachedData('accommodations', process.env.RCBT_ACCOMMODATION_URL!);
    if (s) data = data.filter(a => a.serviceName?.toLowerCase().includes(s.toLowerCase()));
    return { currentPage: 'services', appName: 'ที่พักบุรีรัมย์', accommodations: data };
  }

  @Get('accommodation-detail/:id')
  @Render('accommodation_detail')
  async getAccommodationDetail(@Param('id') id: string) {
    try {
      const res = await axios.get(`${process.env.RCBT_BASE_URL!}/accommodation/detail/${id}`);
      const item = res.data?.data?.[0] || null;
      return { currentPage: 'services', item, appName: item?.serviceName };
    } catch (e) { return { currentPage: 'services', item: null, appName: 'Error' }; }
  }

  @Get('routes')
  @Render('routes')
  async getRoutes(@Query('search') s?: string) {
    let data = await this.getCachedData('routes', process.env.RCBT_ROUTE_URL!);
    if (s) data = data.filter(r => r.serviceName?.toLowerCase().includes(s.toLowerCase()));
    return { currentPage: 'services', appName: 'เส้นทางท่องเที่ยว', routes: data };
  }

  @Get('subroutes/:id')
  @Render('subroutes')
  async getRoutesDetail(@Param('id') id: string) {
    try {
      const res = await axios.get(`${process.env.RCBT_BASE_URL!}/tourismroute/detail/${id}`);
      const route = res.data?.data || null;
      return { currentPage: 'services', appName: route?.serviceName, route, activities: route?.sub_routes?.[0]?.activities || [] };
    } catch (e) { return { currentPage: 'services', appName: 'ไม่พบข้อมูล', route: null, activities: [] }; }
  }

  @Get('subroute-activities/:subid')
  @Render('subroute_activities')
  async getSubRouteActivities(@Param('subid') subid: string, @Query('mainId') queryMainId: string) {
    try {
      const all = await this.getCachedData('routes', process.env.RCBT_ROUTE_URL!);
      const parent = all.find((r: any) => r.sub_routes?.some((s: any) => String(s.tourism_sub_route_id) === String(subid)));
      const mainId = queryMainId || parent?.serviceID || '86';
      const res = await axios.get(`${process.env.RCBT_BASE_URL!}/tourismroute/detail/${mainId}`);
      const sub = res.data?.data?.sub_routes?.find((s: any) => String(s.tourism_sub_route_id) === String(subid));
      return { currentPage: 'services', appName: sub?.tourism_sub_route_name_initial, activities: sub?.activities || [], subRoute: sub, mainId, serviceName: res.data?.data?.serviceName };
    } catch (e) { return { currentPage: 'services', appName: 'กิจกรรม', activities: [], subRoute: null, mainId: queryMainId || '86' }; }
  }

  @Get('restaurants')
  @Render('restaurants')
  async getRestaurants(@Query('search') s?: string) {
    let data = await this.getCachedData('restaurants', process.env.RCBT_RESTAURANT_URL!);
    if (s) data = data.filter(r => r.serviceName?.toLowerCase().includes(s.toLowerCase()));
    return { currentPage: 'services', appName: 'ร้านอาหาร', restaurants: data };
  }

  @Get('restaurant-detail/:id')
  @Render('restaurant_detail')
  async getRestaurantDetail(@Param('id') id: string) {
    try {
      const res = await axios.get(`${process.env.RCBT_BASE_URL!}/restaurant/detail/${id}`);
      return { currentPage: 'services', restaurant: res.data?.serviceId ? res.data : null };
    } catch (e) { return { currentPage: 'services', restaurant: null }; }
  }

  @Get('activities')
  @Render('activities')
  async getActivities(@Query('search') s?: string) {
    let data = await this.getCachedData('activities', process.env.RCBT_ACTIVITY_URL!);
    if (s) data = data.filter(a => a.serviceName?.toLowerCase().includes(s.toLowerCase()));
    return { currentPage: 'services', appName: 'กิจกรรมชุมชน', activities: data };
  }

  @Get('activity-detail/:id')
  @Render('activity_detail')
  async getActivityDetail(@Param('id') id: string) {
    try {
      const res = await axios.get(`${process.env.RCBT_BASE_URL}/activitylist/${id}`);
      return { currentPage: 'services', activity: res.data?.data?.[0] };
    } catch (e) { return { currentPage: 'services', activity: null }; }
  }

  @Get('shop')
  @Render('shop')
  async getShop(
    @Query('search') s?: string, 
    @Query('page') page: string = '1',
    @Query('category') cat: string = 'ทั้งหมด'
  ) {
    const allData = await this.getCachedData('products', process.env.RCBT_PRODUCT_URL!);
    const perPage = 20;
    const currentPage = parseInt(page) || 1;

    // 1. กรองข้อมูลเบื้องต้น (รูปภาพ และ ช่องทางติดต่อ)
    let data = allData.filter(p => {
      const img = p.serviceImage || '';
      const orderLink = (p.serviceOrder?.OrderLink || '').trim().toLowerCase();
      const bookingLink = (p.serviceOrder?.BookingLink || '').trim().toLowerCase();
      
      // *** แก้ไข: ใช้ Telephone และ Line ให้ตรงกับ JSON ***
      const tel = (p.serviceContact?.Telephone || '').trim();
      const line = (p.serviceContact?.Line || '').trim();

      const isImgValid = img !== '' && !img.includes('placehold.co') && !img.toLowerCase().endsWith('null');
      const hasValidOrder = orderLink !== '' && !orderLink.startsWith('xxx');
      const hasValidBooking = bookingLink !== '' && !bookingLink.startsWith('xxx');
      
      // เช็คว่ามีอย่างใดอย่างหนึ่ง: ลิงก์ซื้อ, ลิงก์จอง, เบอร์โทร หรือ ไอดีไลน์
      const hasContact = hasValidOrder || 
                         hasValidBooking || 
                         (tel !== '' && tel !== '-' && tel !== 'ไม่ได้ระบุ') ||
                         (line !== '' && line !== '-' && line !== 'ไม่ได้ระบุ');

      return isImgValid && hasContact;
    });

    // 2. กรองตามหมวดหมู่ (แก้ไขให้มี 5 ประเภทตาม EJS)
    if (cat !== 'ทั้งหมด') {
      data = data.filter(item => {
        const gName = item.serviceGroup?.GroupName || '';
        let itemCat = 'อื่นๆ';

        // แยก 'ผลไม้' ออกจาก 'ของกิน'
        if (gName.includes('ผลไม้')) {
          itemCat = 'ผลไม้';
        } else if (gName.includes('อาหาร') || gName.includes('ข้าว') || gName.includes('บริโภค')) {
          itemCat = 'ของกิน';
        } else if (gName.includes('จักสาน') || gName.includes('ฝีมือ') || gName.includes('กระเป๋า') || gName.includes('เครื่องใช้')) {
          itemCat = 'ของใช้';
        } else if (gName.includes('ผ้า')) {
          itemCat = 'ผ้าไหม';
        } else if (gName.includes('สมุนไพร') || gName.includes('สุขภาพ')) {
          itemCat = 'สุขภาพ';
        }

        return itemCat === cat;
      });
    }

    // 3. กรองตามคำค้นหา (Search)
    if (s) {
      const searchLower = s.toLowerCase();
      data = data.filter(p => 
        (p.serviceName?.toLowerCase().includes(searchLower)) || 
        (p.serviceContact?.OwnerName?.toLowerCase().includes(searchLower))
      );
    }

    // 4. จัดทำ Pagination
    const totalItems = data.length;
    const totalPages = Math.ceil(totalItems / perPage);
    const paginatedData = data.slice((currentPage - 1) * perPage, currentPage * perPage);

    return { 
      currentPage: 'shop', 
      appName: 'ตลาดชุมชน', 
      products: paginatedData,
      pagination: {
        current: currentPage,
        total: totalPages,
        hasNext: currentPage < totalPages,
        hasPrev: currentPage > 1,
        search: s || '',
        category: cat 
      }
    };
  }

  @Get('chat')
  @Render('chat')
  getChatPage() { return { currentPage: 'chat', appName: 'คุยกับน้องรุ้ง AI' }; }
}