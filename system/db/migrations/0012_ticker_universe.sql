BEGIN;

CREATE TABLE ticker_universe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL,
  exchange_code text NOT NULL,
  name_en text NOT NULL,
  name_zh text NOT NULL,
  market text NOT NULL CHECK (market IN ('US', 'JP', 'HK', 'CN_A')),
  sleeve text NOT NULL CHECK (sleeve IN ('us', 'developedNonUs', 'emerging')),
  style text NOT NULL CHECK (style IN ('growth', 'value')),
  instrument_type text NOT NULL CHECK (instrument_type IN ('equity', 'etf')),
  source_name text NOT NULL,
  source_url text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ticker, exchange_code)
);

INSERT INTO ticker_universe
  (ticker, exchange_code, name_en, name_zh, market, sleeve, style, instrument_type, source_name, source_url)
VALUES
  ('AAPL', 'NASDAQ', 'Apple Inc.', '苹果公司', 'US', 'us', 'growth', 'equity', 'Nasdaq', 'https://www.nasdaq.com/market-activity/stocks/aapl'),
  ('MSFT', 'NASDAQ', 'Microsoft Corporation', '微软公司', 'US', 'us', 'growth', 'equity', 'Nasdaq', 'https://www.nasdaq.com/market-activity/stocks/msft'),
  ('NVDA', 'NASDAQ', 'NVIDIA Corporation', '英伟达公司', 'US', 'us', 'growth', 'equity', 'Nasdaq', 'https://www.nasdaq.com/market-activity/stocks/nvda'),
  ('AMZN', 'NASDAQ', 'Amazon.com, Inc.', '亚马逊公司', 'US', 'us', 'growth', 'equity', 'Nasdaq', 'https://www.nasdaq.com/market-activity/stocks/amzn'),
  ('JPM', 'NYSE', 'JPMorgan Chase & Co.', '摩根大通', 'US', 'us', 'value', 'equity', 'NYSE', 'https://www.nyse.com/quote/XNYS:JPM'),
  ('XOM', 'NYSE', 'Exxon Mobil Corporation', '埃克森美孚', 'US', 'us', 'value', 'equity', 'NYSE', 'https://www.nyse.com/quote/XNYS:XOM'),
  ('JNJ', 'NYSE', 'Johnson & Johnson', '强生公司', 'US', 'us', 'value', 'equity', 'NYSE', 'https://www.nyse.com/quote/XNYS:JNJ'),
  ('KO', 'NYSE', 'The Coca-Cola Company', '可口可乐公司', 'US', 'us', 'value', 'equity', 'NYSE', 'https://www.nyse.com/quote/XNYS:KO'),
  ('6758', 'TSE', 'Sony Group Corporation', '索尼集团', 'JP', 'developedNonUs', 'growth', 'equity', 'Japan Exchange Group', 'https://www.jpx.co.jp/english/'),
  ('9984', 'TSE', 'SoftBank Group Corp.', '软银集团', 'JP', 'developedNonUs', 'growth', 'equity', 'Japan Exchange Group', 'https://www.jpx.co.jp/english/'),
  ('6861', 'TSE', 'Keyence Corporation', '基恩士', 'JP', 'developedNonUs', 'growth', 'equity', 'Japan Exchange Group', 'https://www.jpx.co.jp/english/'),
  ('8035', 'TSE', 'Tokyo Electron Limited', '东京电子', 'JP', 'developedNonUs', 'growth', 'equity', 'Japan Exchange Group', 'https://www.jpx.co.jp/english/'),
  ('7203', 'TSE', 'Toyota Motor Corporation', '丰田汽车', 'JP', 'developedNonUs', 'value', 'equity', 'Japan Exchange Group', 'https://www.jpx.co.jp/english/'),
  ('8306', 'TSE', 'Mitsubishi UFJ Financial Group', '三菱日联金融集团', 'JP', 'developedNonUs', 'value', 'equity', 'Japan Exchange Group', 'https://www.jpx.co.jp/english/'),
  ('9432', 'TSE', 'Nippon Telegraph and Telephone', '日本电信电话', 'JP', 'developedNonUs', 'value', 'equity', 'Japan Exchange Group', 'https://www.jpx.co.jp/english/'),
  ('8058', 'TSE', 'Mitsubishi Corporation', '三菱商事', 'JP', 'developedNonUs', 'value', 'equity', 'Japan Exchange Group', 'https://www.jpx.co.jp/english/'),
  ('0700', 'HKEX', 'Tencent Holdings Limited', '腾讯控股', 'HK', 'emerging', 'growth', 'equity', 'Hong Kong Exchanges and Clearing', 'https://www.hkex.com.hk/Market-Data/Securities-Prices/Equities'),
  ('9988', 'HKEX', 'Alibaba Group Holding Limited', '阿里巴巴集团', 'HK', 'emerging', 'growth', 'equity', 'Hong Kong Exchanges and Clearing', 'https://www.hkex.com.hk/Market-Data/Securities-Prices/Equities'),
  ('300750', 'SZSE', 'Contemporary Amperex Technology Co., Ltd.', '宁德时代', 'CN_A', 'emerging', 'growth', 'equity', 'Shenzhen Stock Exchange', 'https://www.szse.cn/English/'),
  ('002594', 'SZSE', 'BYD Company Limited', '比亚迪', 'CN_A', 'emerging', 'growth', 'equity', 'Shenzhen Stock Exchange', 'https://www.szse.cn/English/'),
  ('0005', 'HKEX', 'HSBC Holdings plc', '汇丰控股', 'HK', 'emerging', 'value', 'equity', 'Hong Kong Exchanges and Clearing', 'https://www.hkex.com.hk/Market-Data/Securities-Prices/Equities'),
  ('1299', 'HKEX', 'AIA Group Limited', '友邦保险', 'HK', 'emerging', 'value', 'equity', 'Hong Kong Exchanges and Clearing', 'https://www.hkex.com.hk/Market-Data/Securities-Prices/Equities'),
  ('600036', 'SSE', 'China Merchants Bank Co., Ltd.', '招商银行', 'CN_A', 'emerging', 'value', 'equity', 'Shanghai Stock Exchange', 'https://english.sse.com.cn/'),
  ('601318', 'SSE', 'Ping An Insurance (Group) Company of China, Ltd.', '中国平安', 'CN_A', 'emerging', 'value', 'equity', 'Shanghai Stock Exchange', 'https://english.sse.com.cn/');

COMMIT;
