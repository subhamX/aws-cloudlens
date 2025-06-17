# AWS CloudLens

A comprehensive AWS infrastructure monitoring and analysis platform consisting of multiple microservices. Talk to us via Telegram.

![](https://raw.githubusercontent.com/subhamX/aws-cloudlens/refs/heads/main/docs/main.png)



Monitors your AWS account, gives you comprehensive insights on cost, security, and practical ways of saving costs.

## Project Structure

```
agent-starter/
├── src/              # Source code
├── drizzle-db/       # Database migrations
├── scripts/          # Utility scripts
├── index.ts         # Entry point
└── drizzle.config.ts # Database configuration
```

## Development

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Run production build
- `npm run db` - Generate and run database migrations

## Features

- TypeScript-based agent development
- PostgreSQL database with Drizzle ORM
- AWS SDK integration
- Telegram bot support
- Chart.js for data visualization
- Built-in tunneling with ngrok


gcloud config set compute/region europe-west9y


git remote add origin1 git@github.com:subhamX/cloudlens-prod.git
git branch -M main
git push -u origin1 main