import 'dotenv/config'
import AwsInfraGuardianAgent from '../awsReportAgent'
import InfraGuardianTelegramBot from '../telegramOnboardBot'

// Create the agent
const infraGuardianAwsAgent = new AwsInfraGuardianAgent(3000)
const telegramBot = new InfraGuardianTelegramBot(3002)

console.log(`Registering...`)
infraGuardianAwsAgent.start()
telegramBot.start()
