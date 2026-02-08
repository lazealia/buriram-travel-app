import { Injectable } from '@nestjs/common';
import * as dialogflow from '@google-cloud/dialogflow';
import { v4 as uuid } from 'uuid';

@Injectable()
export class AppService {
  private sessionClient: dialogflow.SessionsClient;
  private projectId: string;

  constructor() {
    // 1. ดึงค่า JSON String จาก env
    const credentials = JSON.parse(process.env.DIALOGFLOW_PRIVATE_KEY!);
    
    // 2. ตั้งค่า Project ID
    this.projectId = credentials.project_id;

    // 3. สร้าง Client โดยใช้ credentials แทน keyFilename
    this.sessionClient = new dialogflow.SessionsClient({
      credentials: {
        client_email: credentials.client_email,
        private_key: credentials.private_key,
      },
    });
  }

  async detectIntent(text: string): Promise<string | string[]> {
    try {
      const sessionId = uuid();
      const sessionPath = this.sessionClient.projectAgentSessionPath(this.projectId, sessionId);

      const request = {
        session: sessionPath,
        queryInput: {
          text: {
            text: text,
            languageCode: 'th-TH',
          },
        },
      };

      const [response] = await this.sessionClient.detectIntent(request);
      const result = response.queryResult;

      if (!result) {
        return 'ขออภัยจ้า น้องรุ้งมึนหัวนิดหน่อย ลองถามใหม่อีกครั้งนะ';
      }

      if (result.fulfillmentMessages && result.fulfillmentMessages.length > 0) {
        const messages = result.fulfillmentMessages
          .filter(m => m.text && m.text.text && m.text.text.length > 0)
          .map(m => m.text!.text![0]);

        if (messages.length > 0) return messages;
      }

      return result.fulfillmentText || 'น้องรุ้งไม่แน่ใจคำตอบนี้จ้า';
      
    } catch (error) {
      console.error('Dialogflow Error:', error);
      return 'น้องรุ้งขอประมวลผลแป๊บนึงนะจ๊ะ';
    }
  }
}