import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  publishIntervalMinutes: parseInt(process.env.PUBLISH_INTERVAL_MINUTES || '60', 10),
  autoStartScheduler: process.env.AUTO_START_SCHEDULER !== 'false',
  dataDir: path.resolve(process.env.DATA_DIR || './data'),
  memoryProvider: (process.env.MEMORY_PROVIDER || 'local') as 'local' | 'breeth',
  breethApiKey: process.env.BREETH_API_KEY || '',
  breethBaseUrl: process.env.BREETH_BASE_URL || 'https://api.breeth.ai',
  geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-flash-latest',
};
