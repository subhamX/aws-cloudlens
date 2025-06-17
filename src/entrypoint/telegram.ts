
import InfraGuardianTelegramBot from '../telegramOnboardBot'


const port = parseInt(process.env.PORT || '3000')

console.log(`Starting CloudLens on port ${port}`)

const telegramBot = new InfraGuardianTelegramBot(port)
telegramBot.start()
