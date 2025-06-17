import dotenv from 'dotenv'
// If you see a type error for node-telegram-bot-api, run: npm install --save-dev @types/node-telegram-bot-api
import TelegramBot, { Message } from 'node-telegram-bot-api'
import { Agent } from '@openserv-labs/sdk'
import axios from 'axios'
import { z } from 'zod'
import { drizzleDb } from '../drizzle-db/db'
import { telegramUsers } from '../drizzle-db/schema/main'
import { eq } from 'drizzle-orm'

// Load environment variables
dotenv.config()

const CROSS_ACCOUNT_ROLE_ARN = process.env.CROSS_ACCOUNT_ROLE_ARN!;

class InfraGuardianTelegramBot extends Agent {
  private bot: TelegramBot
  private workspaceId: number
  private infraGuardianAgentId: number // ID of the InfraGuardian Agent

  constructor() {
    const requiredVars = ['TELEGRAM_BOT_TOKEN', 'OPENSERV_API_KEY', 'WORKSPACE_ID', 'INFRAGUARDIAN_AGENT_ID']
    const missingVars = requiredVars.filter(varName => !process.env[varName])
    if (missingVars.length > 0) {
      console.error('❌ Missing required environment variables:', missingVars)
      process.exit(1)
    }
    super({
      systemPrompt: 'You are a helpful assistant for onboarding users to InfraGuardianProject and generating AWS cost insights reports.',
      apiKey: process.env.OPENSERV_API_KEY!
    })
    this.bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN!, { polling: true })
    this.workspaceId = parseInt(process.env.WORKSPACE_ID!)
    this.infraGuardianAgentId = parseInt(process.env.INFRAGUARDIAN_AGENT_ID!)
    this.setupHandlers()
  }

  // Get user state from DB
  private async getUserState(telegramId: number) {
    console.log('Getting user state for telegramId:', telegramId)
    const rows = await drizzleDb.select().from(telegramUsers)
    .where(eq(telegramUsers.telegramId, telegramId.toString()));
    console.log('Rows:', rows)
    if(rows.length) return rows[0];
    return null;
  }

  // Set user state in DB (upsert)
  private async setUserState(telegramId: number, state: any) {
    const existing = await this.getUserState(telegramId)
    console.log('Existing user state:', existing)
    if (existing) {
      await drizzleDb.update(telegramUsers)
        .set({
          step: state.step,
          method: state.method,
          aws_account_id: state.aws_account_id,
          aws_access_key_id: state.aws_access_key_id,
          aws_secret_access_key: state.aws_secret_access_key,
          onboarded: !!state.onboarded
        })
        .where(eq(telegramUsers.telegramId, telegramId.toString()))
    } else {
        console.log('Inserting new user state:', state)
        
      await drizzleDb.insert(telegramUsers).values({
        telegramId: telegramId.toString(),
        step: state.step,
        method: state.method,
        aws_account_id: state.aws_account_id,
        aws_access_key_id: state.aws_access_key_id,
        aws_secret_access_key: state.aws_secret_access_key,
        onboarded: !!state.onboarded
      })
    }

    console.log(`Insert successful!`)
  }

  private async getHelpText(chatId: number, userState: typeof telegramUsers.$inferSelect | null, invalidCommand = false): Promise<string> {
    const onboarded = userState?.onboarded ? '✅ Onboarded' : '❌ Not onboarded'
    let helpText = ''
    if (invalidCommand) {
      helpText += '❌ *Invalid command or input.*\n\n'
    }
    helpText += `ℹ️ *AWS Cost Insights*\n\nCommands:\n/start - Welcome\n/onboard - Start onboarding\n/report - Get AWS cost insights report\n/help - Show this help message\n\n*Onboarding status:* ${onboarded}`
    return helpText;
  }

  private setupHandlers() {
    // /start command
    this.bot.onText(/\/start/, async (msg: Message) => {
      const chatId = msg.chat.id
      await this.setUserState(chatId, { step: 'choose_method' })
      await this.bot.sendMessage(chatId, `👋 Welcome to InfraGuardian Onboarding Bot!\n\nYou can onboard your AWS account to InfraGuardianProject in two ways:\n1️⃣ Role-based access (recommended)\n2️⃣ Provide AWS credentials\n\nPlease reply with 1 or 2 to choose your onboarding method.`)
    })

    // /onboard command
    this.bot.onText(/\/onboard/, async (msg: Message) => {
      const chatId = msg.chat.id
      const state = await this.getUserState(chatId)
      if (state && state.onboarded) {
        await this.bot.sendMessage(chatId, `✅ You are already onboarded!\nIf you want to update your AWS account or credentials, just reply with the new value when prompted.`)
        return
      }
      await this.setUserState(chatId, { step: 'choose_method' })
      await this.bot.sendMessage(chatId, `How would you like to onboard?\n\n1️⃣ Role-based access (recommended)\n2️⃣ Provide AWS credentials\n\nReply with 1 or 2.`)
    })

    // /report command
    this.bot.onText(/\/report/, async (msg: Message) => {
      const chatId = msg.chat.id
      const state = await this.getUserState(chatId)
      if (!state || !state.onboarded) {
        await this.bot.sendMessage(chatId, '❌ Please onboard first using /onboard.')
        return
      }
      await this.bot.sendMessage(chatId, '⏳ Generating AWS cost insights report...')
      try {
        const report = await this.generateCostReport(state)
        await this.bot.sendMessage(chatId, `📊 AWS Cost Insights Report:\n\n${report}`)
      } catch (err) {
        await this.bot.sendMessage(chatId, '❌ Failed to generate report. Please try again.')
      }
    })

    // /help command
    this.bot.onText(/\/help/, async (msg: Message) => {
      const chatId = msg.chat.id
      await this.bot.sendMessage(chatId, `ℹ️ *Help*\n\nCommands:\n/start - Welcome\n/onboard - Start onboarding\n/report - Get AWS cost insights report\n/help - Show this help message`, { parse_mode: 'Markdown' })
    })

    // Handle onboarding steps and user replies
    this.bot.on('message', async (msg: Message) => {
        console.log('Message received:', msg)
      const chatId = msg.chat.id
      const text = msg.text?.trim()
      if (!text || text.startsWith('/')) return // skip commands
      const state = await this.getUserState(chatId)
      if (!state){
        // send help text
        const helpText = await this.getHelpText(chatId, state, true)
        await this.bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' })
        return
      }
      // Step: choose onboarding method
      if (state.step === 'choose_method') {
        if (text === '1') {
          await this.setUserState(chatId, { ...state, step: 'await_account_id', method: 'role' })
          await this.bot.sendMessage(chatId, `Please provide your AWS Account ID.${state.aws_account_id ? `\n\n(Previously: ${state.aws_account_id})` : ''}\n\nThen, grant cross-account access to this role ARN:\n${CROSS_ACCOUNT_ROLE_ARN}`)
        } else if (text === '2') {
          await this.setUserState(chatId, { ...state, step: 'await_access_key', method: 'creds' })
          await this.bot.sendMessage(chatId, `Please provide your AWS Access Key ID:${state.aws_access_key_id ? `\n\n(Previously: ${state.aws_access_key_id})` : ''}`)
        } else {
          const helpText = await this.getHelpText(chatId, state, true)
          await this.bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' })
        }
      } else if (state.step === 'await_account_id') {
        if (/^\d{12}$/.test(text)) {
          await this.setUserState(chatId, { ...state, step: null, method: 'role', onboarded: true, aws_account_id: text })
          await this.bot.sendMessage(chatId, '✅ Onboarding complete via role-based access!\nYou can now use /report to get AWS cost insights.')
        } else {
          const helpText = await this.getHelpText(chatId, state, true)
          await this.bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' })
        }
      } else if (state.step === 'await_access_key') {
        if (/^AKIA[0-9A-Z]{16}$/.test(text)) {
          // Remove secret key if access key is changed
          await this.setUserState(chatId, { ...state, step: 'await_secret_key', aws_access_key_id: text, aws_secret_access_key: null })
          await this.bot.sendMessage(chatId, `Now provide your AWS Secret Access Key:`)
        } else {
          const helpText = await this.getHelpText(chatId, state, true)
          await this.bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' })
        }
      } else if (state.step === 'await_secret_key') {
        if (/^[0-9a-zA-Z\/+=]{40}$/.test(text)) {
          await this.setUserState(chatId, { ...state, step: null, method: 'creds', onboarded: true, aws_secret_access_key: text })
          await this.bot.sendMessage(chatId, '✅ Onboarding complete with credentials!\nYou can now use /report to get AWS cost insights.')
        } else {
          const helpText = await this.getHelpText(chatId, state, true)
          await this.bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' })
        }
      } else {
        // For any other invalid state or input, show help text
        const helpText = await this.getHelpText(chatId, state, true)
        await this.bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' })
      }
    })



    this.bot.on('polling_error', (error: Error) => {
      console.error('Telegram polling error:', error)
    })
    console.log('✅ Telegram bot handlers set up successfully!')
  }

  // Generate AWS cost insights report by calling InfraGuardian Agent
  private async generateCostReport(state: any): Promise<string> {
    // Prepare input for InfraGuardian Agent
    let input: any = {}
    if (state.method === 'role') {
      input = {
        method: 'role',
        awsAccountId: state.aws_account_id,
        crossAccountRoleArn: CROSS_ACCOUNT_ROLE_ARN
      }
    } else if (state.method === 'creds') {
      input = {
        method: 'creds',
        aws_access_key_id: state.aws_access_key_id,
        aws_secret_access_key: state.aws_secret_access_key
      }
    }
    // Create a task for InfraGuardian Agent
    const task = await this.createTask({
      workspaceId: this.workspaceId,
      assignee: this.infraGuardianAgentId,
      description: 'Generate AWS cost insights report',
      body: 'Analyze AWS account and generate a cost insights report.',
      input,
      expectedOutput: 'A detailed AWS cost insights report',
      dependencies: []
    })
    // Wait for task completion (reuse waitForTaskCompletion from starter)
    const result = await this.waitForTaskCompletion(task.id)
    return result || 'No report available.'
  }

  // Wait for task completion (copied from starter, without chatId)
  private async waitForTaskCompletion(taskId: number): Promise<string | null> {
    const maxWaitTime = 120000 // 2 minutes
    const pollInterval = 5000   // 5 seconds
    const startTime = Date.now()
    while (Date.now() - startTime < maxWaitTime) {
      try {
        const taskDetail = await this.getTaskDetail({
          taskId: taskId,
          workspaceId: this.workspaceId
        })
        if (taskDetail?.status === 'done') {
          if (taskDetail.attachments && taskDetail.attachments.length > 0) {
            try {
              const files = await this.getFiles({ workspaceId: this.workspaceId })
              const resultFile = files.find((file: any) => 
                taskDetail.attachments?.some((att: any) => file.path?.includes(att.path))
              )
              if (resultFile) {
                const fileContent = await axios.get(resultFile.fullUrl)
                await this.safeDeleteFile(this.workspaceId, resultFile.id)
                return fileContent.data || 'Task completed but could not retrieve result.'
              }
            } catch (fileError) {
              console.error('Error reading result file:', fileError)
            }
          }
          if (taskDetail.output) {
            return taskDetail.output
          }
          return 'Task completed.'
        }
        if (taskDetail?.status === 'error') {
          return null
        }
        await new Promise(resolve => setTimeout(resolve, pollInterval))
      } catch (pollError) {
        // Continue polling despite errors
      }
    }
    return 'Timeout. The task might still be processing.'
  }

  // Safe deleteFile wrapper (in case not present on Agent)
  private async safeDeleteFile(workspaceId: number, fileId: number): Promise<void> {
    const self = this as any;
    if (typeof self.deleteFile === 'function') {
      await self.deleteFile({ workspaceId, fileId })
    }
    // else, do nothing
    return Promise.resolve()
  }

  public async start(): Promise<void> {
    try {
      console.log('🚀 Starting InfraGuardian Telegram Bot...')
      await super.start()
      console.log('✅ Bot is running! Send /start to begin.')
      process.on('SIGINT', () => {
        console.log('\n⏹️ Shutting down bot...')
        this.bot.stopPolling()
        process.exit(0)
      })
    } catch (error) {
      console.error('❌ Error starting bot:', error)
      process.exit(1)
    }
  }
}

if (require.main === module) {
  const bot = new InfraGuardianTelegramBot()
  bot.start()
}

export default InfraGuardianTelegramBot 