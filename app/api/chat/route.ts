// 1. Install required packages: pnpm i dotenv langchain pusher zod

// 2. Import necessary modules
import { NextApiRequest, NextApiResponse } from 'next';
const { ChatOpenAI } = require("langchain/chat_models/openai");
import { DynamicStructuredTool } from 'langchain/tools';
import { initializeAgentExecutorWithOptions } from 'langchain/agents';
import dotenv from 'dotenv';
import z from 'zod';
import Pusher from 'pusher';

// 3. Load environment variables from .env file
dotenv.config();

// 4. Instantiate ChatOpenAI model with specific options
const model = new ChatOpenAI({ temperature: 0, streaming: true });

// 5. Initialize Pusher with configuration from environment variables
const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER,
});

// 6. Handle incoming POST request
export async function POST(req: Request) {
  // Parse JSON content from the request body
  const { message } = await req.json()

  // 7. Define a tool for fetching historical stock data
  const fetchHistoricalData = new DynamicStructuredTool({
    name: "fetchHistoricalData",
    description: "Triggers stock data based on their ticker",
    schema: z.object({
      ticker: z.string(),
    }),
    func: async ({ ticker }) => {
      // API key for accessing stock data
      const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
      const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${ticker}&apikey=${apiKey}`;
      const res = await fetch(url);
      const jsonResponse = await res.json();

      // Extract and format stock data
      const data = jsonResponse["Time Series (Daily)"];
      const chartData = Object.entries(data).map(([date, values]) => ({
        date,
        value: parseFloat(values["4. close"]),
      }));

      // Trigger Pusher events for stock data
      pusher.trigger("channel-1", "chart", chartData);
      pusher.trigger("channel-1", "ticker", ticker);

      // Return the latest stock data
      return JSON.stringify(chartData[chartData.length - 1]);
    },
  });

  // 8. Initialize agent executor with tools and model
  const tools = [fetchHistoricalData];
  const executor = await initializeAgentExecutorWithOptions(tools, model, {
    agentType: "openai-functions",
  });

  // 9. Run the executor with the received message
  const result = await executor.run(message);

  // 10. Trigger a Pusher event with the execution result
  pusher.trigger("channel-1", "message", result);
};
