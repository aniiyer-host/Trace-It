import winston from 'winston';
import { ElasticsearchTransport } from 'winston-elasticsearch';

// Define the log format
const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Define transports
const transports: any[] = [
  new winston.transports.Console({
    format: logFormat,
  })
];

// Add Elasticsearch transport if configured
if (process.env.ELASTICSEARCH_NODE) {
  const esTransport = new ElasticsearchTransport({
    level: 'info',
    node: process.env.ELASTICSEARCH_NODE,
    index: 'traceit-logs',
    // Optionally, you can add authentication if needed
    // auth: {
    //   username: process.env.ELASTICSEARCH_USERNAME,
    //   password: process.env.ELASTICSEARCH_PASSWORD
    // }
  });
  transports.push(esTransport);
}

// Create the logger
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: logFormat,
  transports,
  exitOnError: false,
});

export default logger;