import dotenv from 'dotenv'
// If you see a type error for node-telegram-bot-api, run: npm install --save-dev @types/node-telegram-bot-api
import TelegramBot, { Message } from 'node-telegram-bot-api'
import { Agent } from '@openserv-labs/sdk'
import axios from 'axios'
import { z } from 'zod'
import { drizzleDb } from '../drizzle-db/db'
import { awsReports, telegramUsers } from '../drizzle-db/schema/main'
import { eq, isNull, and, isNotNull, desc } from 'drizzle-orm'
import { createCanvas } from 'canvas'
import Chart from 'chart.js/auto'

// Load environment variables
dotenv.config()

const CROSS_ACCOUNT_ROLE_ARN = process.env.CROSS_ACCOUNT_ROLE_ARN!;

class InfraGuardianTelegramBot extends Agent {
    private bot: TelegramBot
    private workspaceId: number
    private infraGuardianAgentId: number // ID of the InfraGuardian Agent

    constructor(port: number) {
        const requiredVars = ['TELEGRAM_BOT_TOKEN', 'OPENSERV_API_KEY_AWS', 'OPENSERV_API_KEY_TELEGRAM', 'WORKSPACE_ID', 'INFRAGUARDIAN_AWS_AGENT_ID']
        const missingVars = requiredVars.filter(varName => !process.env[varName])
        if (missingVars.length > 0) {
            console.error('❌ Missing required environment variables:', missingVars)
            process.exit(1)
        }
        super({
            systemPrompt: 'You are a helpful assistant for onboarding users to CloudLens 🚀 and generating AWS cost insights reports.',
            apiKey: process.env.OPENSERV_API_KEY_TELEGRAM!,
            port: port,
        })
        this.bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN!, { polling: true })
        this.workspaceId = parseInt(process.env.WORKSPACE_ID!)
        this.infraGuardianAgentId = parseInt(process.env.INFRAGUARDIAN_AWS_AGENT_ID!)
        this.setupHandlers()
    }

    // Get user state from DB
    private async getUserState(telegramId: number) {
        console.log('Getting user state for telegramId:', telegramId)
        const rows = await drizzleDb.select().from(telegramUsers)
            .where(eq(telegramUsers.telegramId, telegramId.toString()));
        console.log('Rows:', rows)
        if (rows.length) return rows[0];
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

    private async getHelpText(chatId: number, userState: typeof telegramUsers.$inferSelect | null, invalidCommand = false, errorMessage?: string): Promise<string> {
        const onboarded = userState?.onboarded ? '✅ Onboarded' : '❌ Not onboarded'
        let helpText = ''
        if (invalidCommand && !errorMessage) {
            helpText += '❌ *Invalid command or input.*\n\n'
        } else if (errorMessage) {
            helpText += `❌ *${errorMessage}*\n\n`
        }
        helpText += `ℹ️ *CloudLens: Monitors your AWS account, gives you comprehensive insights on cost, security, and practical ways of saving costs.*\n\nCommands:\n/start - Welcome\n/onboard - Start onboarding\n/report - Get AWS infrastructure report\n/lastreport - Get your last report with visualizations\n/help - Show this help message\n\n*Onboarding status:* ${onboarded}`
        return helpText;
    }



    text = `👋 Welcome to InfraGuardian Onboarding Bot!\n\nYou can onboard your AWS account to InfraGuardianProject in two ways:\n1️⃣ Role-based access (coming soon)\n2️⃣ Provide Read-only AWS credentials\n\nPlease reply with 1 or 2 to choose your onboarding method.`
    private setupHandlers() {
        // /start command
        this.bot.onText(/\/start/, async (msg: Message) => {
            const chatId = msg.chat.id
            await this.setUserState(chatId, { step: 'choose_method' })
            await this.bot.sendMessage(chatId, this.text)
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
            await this.bot.sendMessage(chatId, this.text)
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

        // /lastreport command
        this.bot.onText(/\/lastreport/, async (msg: Message) => {
            const chatId = msg.chat.id
            const state = await this.getUserState(chatId)
            if (!state || !state.onboarded) {
                await this.bot.sendMessage(chatId, '❌ Please onboard first using /onboard.')
                return
            }
            await this.bot.sendMessage(chatId, '⏳ Fetching your last report...')
            try {
                const report = await this.getLastReport(state.telegramId)
                if (!report) {
                    await this.bot.sendMessage(chatId, '❌ No completed reports found. Use /report to generate a new one.')
                    return
                }
                await this.sendReportWithVisualizations(chatId, report)
            } catch (err) {
                await this.bot.sendMessage(chatId, '❌ Failed to fetch last report. Please try again.')
            }
        })

        // /help command
        this.bot.onText(/\/help/, async (msg: Message) => {
            const chatId = msg.chat.id
            await this.bot.sendMessage(chatId, `ℹ️ *Help*\n\nCommands:\n/start - Welcome\n/onboard - Start onboarding\n/report - Get AWS cost insights report\n/lastreport - Get your last report with visualizations\n/help - Show this help message`, { parse_mode: 'Markdown' })
        })

        // Handle onboarding steps and user replies
        this.bot.on('message', async (msg: Message) => {
            console.log('Message received:', msg)
            const chatId = msg.chat.id
            const text = msg.text?.trim()
            if (!text || text.startsWith('/')) return // skip commands
            const state = await this.getUserState(chatId)
            if (!state) {
                // send help text
                const helpText = await this.getHelpText(chatId, state, true)
                await this.bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' })
                return
            }
            // Step: choose onboarding method
            if (state.step === 'choose_method') {
                if (text === '1') {
                    await this.bot.sendMessage(chatId, 'Role-based access is coming soon. Please choose option 2 to provide read-only AWS credentials.')
                    return
                    // await this.setUserState(chatId, { ...state, step: 'await_account_id', method: 'role' })
                    // await this.bot.sendMessage(chatId, `Please provide your AWS Account ID.${state.aws_account_id ? `\n\n(Previously: ${state.aws_account_id})` : ''}\n\nThen, grant cross-account access to this role ARN:\n${CROSS_ACCOUNT_ROLE_ARN}`)
                } else if (text === '2') {
                    await this.setUserState(chatId, { ...state, step: 'await_access_key', method: 'creds' })
                    await this.bot.sendMessage(chatId, `Please provide your AWS Access Key ID:${state.aws_access_key_id ? `\n\n(Previously: ${state.aws_access_key_id})` : '\n\n(Like: AKIAZBAHUYFYCFOIQFEJ)'}`)
                } else {
                    const helpText = await this.getHelpText(chatId, state, true)
                    await this.bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' })
                }
            } else if (state.step === 'await_account_id') {
                if (/^\d{12}$/.test(text)) {
                    await this.setUserState(chatId, { ...state, step: null, method: 'role', onboarded: true, aws_account_id: text })
                    await this.bot.sendMessage(chatId, '✅ Onboarding complete via role-based access!\nYou can now use /report to get AWS cost insights.')
                } else {
                    const helpText = await this.getHelpText(chatId, state, true, 'Invalid AWS Account ID')
                    await this.bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' })
                }
            } else if (state.step === 'await_access_key') {
                if (/^AKIA[0-9A-Z]{16}$/.test(text)) {
                    // Remove secret key if access key is changed
                    await this.setUserState(chatId, { ...state, step: 'await_secret_key', aws_access_key_id: text, aws_secret_access_key: null })
                    await this.bot.sendMessage(chatId, `Now provide your AWS Secret Access Key:`)
                } else {
                    const helpText = await this.getHelpText(chatId, state, true, 'Invalid AWS Access Key ID')
                    await this.bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' })
                }
            } else if (state.step === 'await_secret_key') {
                if (/^[0-9a-zA-Z\/+=]{40}$/.test(text)) {
                    await this.setUserState(chatId, { ...state, step: null, method: 'creds', onboarded: true, aws_secret_access_key: text })
                    await this.bot.sendMessage(chatId, '✅ Onboarding complete with credentials!\nYou can now use /report to get AWS cost insights.')
                } else {
                    const helpText = await this.getHelpText(chatId, state, true, 'Invalid AWS Secret Access Key')
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
    private async generateCostReport(state: typeof telegramUsers.$inferSelect): Promise<string> {
        // Prepare input for InfraGuardian Agent
        let input: Record<string, any> = {}
        if (state.method === 'role') {
            input = {
                method: 'role',
                awsAccountId: state.aws_account_id,
                crossAccountRoleArn: CROSS_ACCOUNT_ROLE_ARN,
                runId: state.telegramId.toString()
            }
        } else if (state.method === 'creds') {
            input = {
                method: 'creds',
                aws_access_key_id: state.aws_access_key_id,
                aws_secret_access_key: state.aws_secret_access_key,
                runId: state.telegramId.toString()
            }
        }
        // Create a task for InfraGuardian Agent

        console.log('Creating task for InfraGuardian Agent..., workspaceId:', this.workspaceId, 'assignee:', this.infraGuardianAgentId)

        // check if the report is already
        const pendingReport = await drizzleDb.select().from(awsReports)
            .where(
                and(
                    eq(awsReports.telegramUserId, state.telegramId.toString()),
                    isNull(awsReports.finishedAt)
                )
            )

        if (pendingReport.length > 0) {
            return 'A report is already in progress. Please wait for it to finish.'
        }

        try {
            const task = await this.createTask({
                workspaceId: this.workspaceId,
                assignee: this.infraGuardianAgentId,
                description: 'Generate detailed infrastruture report',
                body: 'Analyze AWS account and generate a cost insights report.',
                input: JSON.stringify(input),
                expectedOutput: 'A detailed structured infrastructure report of S3, Ec2, and CloudFormation',
                dependencies: []
            })
            console.log('Task created:', task)

            // store this

            await drizzleDb.insert(awsReports).values({
                id: task.id.toString(),
                telegramUserId: state.telegramId,
                startedAt: new Date(),
                finishedAt: null
            })
            return 'Submitted request to create a report. It will be available in a few minutes.'
        } catch (e: any) {
            console.log('Error creating task:', e)
            return e.message
        }
    }

    // Wait for task completion (copied from starter, without chatId)
    // TODO: build it...
    private async backgroundSyncTask(taskId: number): Promise<string | null> {
        const maxWaitTime = 120000 // 2 minutes
        const pollInterval = 5000   // 5 seconds
        const startTime = Date.now()
        while (Date.now() - startTime < maxWaitTime) {
            try {
                const taskDetail = await this.getTaskDetail({
                    taskId: taskId,
                    workspaceId: this.workspaceId
                })
                console.log('Task detail:', taskDetail)
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

    // Get the last completed report for a user
    private async getLastReport(telegramId: string) {
        const reports = await drizzleDb.select().from(awsReports)
            .where(
                and(
                    eq(awsReports.telegramUserId, telegramId),
                    isNotNull(awsReports.finishedAt)
                )
            )
            .orderBy(desc(awsReports.startedAt))
            .limit(1)

        if (reports.length === 0) return null
        return reports[0]
    }

    // Get last 3 reports for trend analysis
    private async getLastReports(telegramId: string, limit: number = 3) {
        const reports = await drizzleDb.select().from(awsReports)
            .where(
                and(
                    eq(awsReports.telegramUserId, telegramId),
                    isNotNull(awsReports.finishedAt)
                )
            )
            .orderBy(desc(awsReports.startedAt))
            .limit(limit)

        return reports
    }

    // Generate and send charts for the report
    private async generateAndSendCharts(chatId: number, reportData: typeof awsReports.$inferSelect['report'], telegramId: string) {
        try {
            console.log('Generating and sending charts...', Object.keys(reportData || {}))

            // S3 Visualizations
            if (reportData?.s3?.overallStatistics) {
                const stats = reportData.s3.overallStatistics

                // Send executive summary for S3
                if (reportData.s3.executiveSummary) {
                    await this.bot.sendMessage(chatId, `📊 *S3 Executive Summary*\n\n${reportData.s3.executiveSummary}`, { parse_mode: 'Markdown' })
                }

                // Create canvas for priority chart - Using Doughnut with center text
                const priorityCanvas = createCanvas(800, 400)
                const priorityCtx = priorityCanvas.getContext('2d')

                // Priority chart
                new Chart(priorityCtx, {
                    type: 'doughnut',
                    data: {
                        labels: ['Critical', 'High', 'Medium', 'Low'],
                        datasets: [{
                            data: [
                                stats.findingsByPriority?.critical || 0,
                                stats.findingsByPriority?.high || 0,
                                stats.findingsByPriority?.medium || 0,
                                stats.findingsByPriority?.low || 0
                            ],
                            backgroundColor: [
                                '#dc3545', // Critical - Red
                                '#fd7e14', // High - Orange
                                '#ffc107', // Medium - Yellow
                                '#20c997'  // Low - Teal
                            ],
                            borderWidth: 2,
                            borderColor: '#ffffff'
                        }]
                    },
                    options: {
                        responsive: true,
                        cutout: '60%',
                        plugins: {
                            title: {
                                display: true,
                                text: 'S3 Findings by Priority',
                                font: {
                                    size: 20,
                                    weight: 'bold'
                                },
                                padding: 20
                            },
                            legend: {
                                position: 'bottom',
                                labels: {
                                    padding: 20,
                                    font: {
                                        size: 14
                                    }
                                }
                            },
                            tooltip: {
                                callbacks: {
                                    label: function (context) {
                                        const data = context.dataset.data as number[];
                                        const total = data.reduce((sum, val) => sum + (val || 0), 0);
                                        const value = context.raw as number;
                                        const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
                                        return `${value} findings (${percentage}%)`;
                                    }
                                }
                            }
                        }
                    }
                })

                // Create canvas for category chart - Using Bar chart with horizontal layout
                const categoryCanvas = createCanvas(800, 400)
                const categoryCtx = categoryCanvas.getContext('2d')

                // Category chart
                new Chart(categoryCtx, {
                    type: 'bar',
                    data: {
                        labels: ['Security', 'Cost', 'Storage', 'Performance', 'Other'],
                        datasets: [{
                            label: 'Number of Findings',
                            data: [
                                stats.findingsByCategory?.security || 0,
                                stats.findingsByCategory?.cost || 0,
                                stats.findingsByCategory?.storage || 0,
                                stats.findingsByCategory?.performance || 0,
                                stats.findingsByCategory?.other || 0
                            ],
                            backgroundColor: [
                                '#0d6efd', // Security - Blue
                                '#198754', // Cost - Green
                                '#6f42c1', // Storage - Purple
                                '#0dcaf0', // Performance - Cyan
                                '#6c757d'  // Other - Gray
                            ],
                            borderWidth: 1,
                            borderColor: '#ffffff',
                            borderRadius: 5
                        }]
                    },
                    options: {
                        indexAxis: 'y',
                        responsive: true,
                        plugins: {
                            title: {
                                display: true,
                                text: 'S3 Findings by Category',
                                font: {
                                    size: 20,
                                    weight: 'bold'
                                },
                                padding: 20
                            },
                            legend: {
                                display: false
                            },
                            tooltip: {
                                callbacks: {
                                    label: function (context) {
                                        const data = context.dataset.data as number[];
                                        const total = data.reduce((sum, val) => sum + (val || 0), 0);
                                        const value = context.raw as number;
                                        const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
                                        return `${value} findings (${percentage}%)`;
                                    }
                                }
                            }
                        },
                        scales: {
                            x: {
                                beginAtZero: true,
                                title: {
                                    display: true,
                                    text: 'Number of Findings',
                                    font: {
                                        size: 14,
                                        weight: 'bold'
                                    }
                                },
                                grid: {
                                    display: true,
                                    color: 'rgba(0, 0, 0, 0.1)'
                                }
                            },
                            y: {
                                grid: {
                                    display: false
                                }
                            }
                        }
                    }
                })

                // Convert canvases to buffers
                const priorityBuffer = priorityCanvas.toBuffer('image/png')
                const categoryBuffer = categoryCanvas.toBuffer('image/png')

                // Send S3 charts
                await this.bot.sendPhoto(chatId, priorityBuffer, {
                    caption: '🎯 S3 Priority Distribution (Doughnut View)'
                })
                await this.bot.sendPhoto(chatId, categoryBuffer, {
                    caption: '📈 S3 Category-wise Findings (Horizontal Bar View)'
                })

                // Send S3 strategic recommendations
                if (reportData.s3.strategicRecommendations?.length) {
                    let recommendationsMessage = `🎯 *S3 Strategic Recommendations*\n\n`
                    reportData.s3.strategicRecommendations.forEach((rec: any, index: number) => {
                        recommendationsMessage += `${index + 1}. *${rec.title}*\n` +
                            `${rec.description}\n` +
                            `Impact: ${rec.potentialImpact}\n`
                        if (rec.suggestedActions?.length > 0) {
                            recommendationsMessage += `Suggested Actions:\n${rec.suggestedActions.map((action: string) => `• ${action}`).join('\n')}\n`
                        }
                        recommendationsMessage += '\n'
                    })
                    await this.bot.sendMessage(chatId, recommendationsMessage, { parse_mode: 'Markdown' })
                }
            }

            // CloudFormation Visualizations
            if (reportData?.cfn?.overallStatistics) {
                const stats = reportData.cfn.overallStatistics

                // Send executive summary for CFN
                if (reportData.cfn.executiveSummary) {
                    await this.bot.sendMessage(chatId, `📊 *CloudFormation Executive Summary*\n\n${reportData.cfn.executiveSummary}`, { parse_mode: 'Markdown' })
                }

                // Create canvas for CFN priority chart
                const cfnPriorityCanvas = createCanvas(800, 400)
                const cfnPriorityCtx = cfnPriorityCanvas.getContext('2d')

                // CFN Priority chart
                new Chart(cfnPriorityCtx, {
                    type: 'doughnut',
                    data: {
                        labels: ['Critical', 'High', 'Medium', 'Low'],
                        datasets: [{
                            data: [
                                stats.findingsByPriority?.critical || 0,
                                stats.findingsByPriority?.high || 0,
                                stats.findingsByPriority?.medium || 0,
                                stats.findingsByPriority?.low || 0
                            ],
                            backgroundColor: [
                                '#dc3545', // Critical - Red
                                '#fd7e14', // High - Orange
                                '#ffc107', // Medium - Yellow
                                '#20c997'  // Low - Teal
                            ],
                            borderWidth: 2,
                            borderColor: '#ffffff'
                        }]
                    },
                    options: {
                        responsive: true,
                        cutout: '60%',
                        plugins: {
                            title: {
                                display: true,
                                text: 'CloudFormation Findings by Priority',
                                font: {
                                    size: 20,
                                    weight: 'bold'
                                },
                                padding: 20
                            },
                            legend: {
                                position: 'bottom',
                                labels: {
                                    padding: 20,
                                    font: {
                                        size: 14
                                    }
                                }
                            },
                            tooltip: {
                                callbacks: {
                                    label: function (context) {
                                        const data = context.dataset.data as number[];
                                        const total = data.reduce((sum, val) => sum + (val || 0), 0);
                                        const value = context.raw as number;
                                        const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
                                        return `${value} findings (${percentage}%)`;
                                    }
                                }
                            }
                        }
                    }
                })

                // Create canvas for CFN category chart
                const cfnCategoryCanvas = createCanvas(800, 400)
                const cfnCategoryCtx = cfnCategoryCanvas.getContext('2d')

                // CFN Category chart
                new Chart(cfnCategoryCtx, {
                    type: 'bar',
                    data: {
                        labels: ['Template', 'Security', 'Cost'],
                        datasets: [{
                            label: 'Number of Findings',
                            data: [
                                stats.findingsByCategory?.template || 0,
                                stats.findingsByCategory?.security || 0,
                                stats.findingsByCategory?.cost || 0
                            ],
                            backgroundColor: [
                                '#0d6efd', // Template - Blue
                                '#dc3545', // Security - Red
                                '#198754'  // Cost - Green
                            ],
                            borderWidth: 1,
                            borderColor: '#ffffff',
                            borderRadius: 5
                        }]
                    },
                    options: {
                        indexAxis: 'y',
                        responsive: true,
                        plugins: {
                            title: {
                                display: true,
                                text: 'CloudFormation Findings by Category',
                                font: {
                                    size: 20,
                                    weight: 'bold'
                                },
                                padding: 20
                            },
                            legend: {
                                display: false
                            },
                            tooltip: {
                                callbacks: {
                                    label: function (context) {
                                        const data = context.dataset.data as number[];
                                        const total = data.reduce((sum, val) => sum + (val || 0), 0);
                                        const value = context.raw as number;
                                        const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
                                        return `${value} findings (${percentage}%)`;
                                    }
                                }
                            }
                        },
                        scales: {
                            x: {
                                beginAtZero: true,
                                title: {
                                    display: true,
                                    text: 'Number of Findings',
                                    font: {
                                        size: 14,
                                        weight: 'bold'
                                    }
                                },
                                grid: {
                                    display: true,
                                    color: 'rgba(0, 0, 0, 0.1)'
                                }
                            },
                            y: {
                                grid: {
                                    display: false
                                }
                            }
                        }
                    }
                })

                // Create canvas for cost impact chart
                const costImpactCanvas = createCanvas(800, 400)
                const costImpactCtx = costImpactCanvas.getContext('2d')

                // Convert CFN canvases to buffers
                const cfnPriorityBuffer = cfnPriorityCanvas.toBuffer('image/png')
                const cfnCategoryBuffer = cfnCategoryCanvas.toBuffer('image/png')
                const costImpactBuffer = costImpactCanvas.toBuffer('image/png')

                // Send CFN charts
                await this.bot.sendPhoto(chatId, cfnPriorityBuffer, {
                    caption: '🎯 CloudFormation Priority Distribution (Doughnut View)'
                })
                await this.bot.sendPhoto(chatId, cfnCategoryBuffer, {
                    caption: '📈 CloudFormation Category-wise Findings (Horizontal Bar View)'
                })
                // await this.bot.sendPhoto(chatId, costImpactBuffer, {
                //     caption: '💰 CloudFormation Cost Impact Analysis'
                // })

                // Send CFN strategic recommendations
                if (reportData.cfn.strategicRecommendations?.length) {
                    let recommendationsMessage = `🎯 *CloudFormation Strategic Recommendations*\n\n`
                    reportData.cfn.strategicRecommendations.forEach((rec: any, index: number) => {
                        recommendationsMessage += `${index + 1}. *${rec.title}*\n` +
                            `${rec.description}\n` +
                            `Impact: ${rec.potentialImpact}\n`
                        if (rec.suggestedActions?.length > 0) {
                            recommendationsMessage += `Suggested Actions:\n${rec.suggestedActions.map((action: string) => `• ${action}`).join('\n')}\n`
                        }
                        recommendationsMessage += '\n'
                    })
                    await this.bot.sendMessage(chatId, recommendationsMessage, { parse_mode: 'Markdown' })
                }
            }

            // Trend Analysis (Combined for all services)
            const lastReports = await this.getLastReports(telegramId, 3)
            if (lastReports.length > 1) {
                await this.bot.sendMessage(chatId, '📈 *Trend Analysis (Last 3 Reports)*', { parse_mode: 'Markdown' })

                // Create canvas for trend chart
                const trendCanvas = createCanvas(1000, 500)
                const trendCtx = trendCanvas.getContext('2d')

                // Prepare trend data
                const trendData = lastReports.map(report => {
                    const data = report.report
                    return {
                        date: new Date(report.startedAt || new Date()).toLocaleDateString(),
                        s3: {
                            critical: data?.s3?.overallStatistics?.findingsByPriority?.critical || 0,
                            high: data?.s3?.overallStatistics?.findingsByPriority?.high || 0,
                            medium: data?.s3?.overallStatistics?.findingsByPriority?.medium || 0,
                            low: data?.s3?.overallStatistics?.findingsByPriority?.low || 0,
                        },
                        cfn: {
                            critical: data?.cfn?.overallStatistics?.findingsByPriority?.critical || 0,
                            high: data?.cfn?.overallStatistics?.findingsByPriority?.high || 0,
                            medium: data?.cfn?.overallStatistics?.findingsByPriority?.medium || 0,
                            low: data?.cfn?.overallStatistics?.findingsByPriority?.low || 0,
                        }
                    }
                })

                // Trend chart for S3
                new Chart(trendCtx, {
                    type: 'line',
                    data: {
                        labels: trendData.map(d => d.date),
                        datasets: [
                            {
                                label: 'S3 Critical',
                                data: trendData.map(d => d.s3.critical),
                                borderColor: '#dc3545',
                                tension: 0.1
                            },
                            {
                                label: 'S3 High',
                                data: trendData.map(d => d.s3.high),
                                borderColor: '#fd7e14',
                                tension: 0.1
                            },
                            {
                                label: 'S3 Medium',
                                data: trendData.map(d => d.s3.medium),
                                borderColor: '#ffc107',
                                tension: 0.1
                            },
                            {
                                label: 'S3 Low',
                                data: trendData.map(d => d.s3.low),
                                borderColor: '#20c997',
                                tension: 0.1
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            title: {
                                display: true,
                                text: 'S3 Findings Trend Analysis',
                                font: {
                                    size: 20
                                }
                            },
                            legend: {
                                position: 'bottom'
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                title: {
                                    display: true,
                                    text: 'Number of Findings'
                                }
                            },
                            x: {
                                title: {
                                    display: true,
                                    text: 'Report Date'
                                }
                            }
                        }
                    }
                })

                // Convert trend canvas to buffer
                const trendBuffer = trendCanvas.toBuffer('image/png')

                // Send trend chart
                await this.bot.sendPhoto(chatId, trendBuffer, {
                    caption: '📈 S3 Findings Trend Analysis'
                })

                // Create canvas for CFN trend chart
                const cfnTrendCanvas = createCanvas(1000, 500)
                const cfnTrendCtx = cfnTrendCanvas.getContext('2d')

                // CFN Trend chart
                new Chart(cfnTrendCtx, {
                    type: 'line',
                    data: {
                        labels: trendData.map(d => d.date),
                        datasets: [
                            {
                                label: 'CFN Critical',
                                data: trendData.map(d => d.cfn.critical),
                                borderColor: '#dc3545',
                                tension: 0.1
                            },
                            {
                                label: 'CFN High',
                                data: trendData.map(d => d.cfn.high),
                                borderColor: '#fd7e14',
                                tension: 0.1
                            },
                            {
                                label: 'CFN Medium',
                                data: trendData.map(d => d.cfn.medium),
                                borderColor: '#ffc107',
                                tension: 0.1
                            },
                            {
                                label: 'CFN Low',
                                data: trendData.map(d => d.cfn.low),
                                borderColor: '#20c997',
                                tension: 0.1
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            title: {
                                display: true,
                                text: 'CloudFormation Findings Trend Analysis',
                                font: {
                                    size: 20
                                }
                            },
                            legend: {
                                position: 'bottom'
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                title: {
                                    display: true,
                                    text: 'Number of Findings'
                                }
                            },
                            x: {
                                title: {
                                    display: true,
                                    text: 'Report Date'
                                }
                            }
                        }
                    }
                })

                // Convert CFN trend canvas to buffer
                const cfnTrendBuffer = cfnTrendCanvas.toBuffer('image/png')

                // Send CFN trend chart
                await this.bot.sendPhoto(chatId, cfnTrendBuffer, {
                    caption: '📈 CloudFormation Findings Trend Analysis'
                })

                // Create canvas for progress chart
                const progressCanvas = createCanvas(800, 400)
                const progressCtx = progressCanvas.getContext('2d')

                // Calculate progress for both services
                const firstReport = trendData[0]
                const latestReport = trendData[trendData.length - 1]
                const progress = {
                    s3: {
                        critical: ((firstReport.s3.critical - latestReport.s3.critical) / firstReport.s3.critical * 100).toFixed(1),
                        high: ((firstReport.s3.high - latestReport.s3.high) / firstReport.s3.high * 100).toFixed(1),
                        medium: ((firstReport.s3.medium - latestReport.s3.medium) / firstReport.s3.medium * 100).toFixed(1),
                        low: ((firstReport.s3.low - latestReport.s3.low) / firstReport.s3.low * 100).toFixed(1)
                    },
                    cfn: {
                        critical: ((firstReport.cfn.critical - latestReport.cfn.critical) / firstReport.cfn.critical * 100).toFixed(1),
                        high: ((firstReport.cfn.high - latestReport.cfn.high) / firstReport.cfn.high * 100).toFixed(1),
                        medium: ((firstReport.cfn.medium - latestReport.cfn.medium) / firstReport.cfn.medium * 100).toFixed(1),
                        low: ((firstReport.cfn.low - latestReport.cfn.low) / firstReport.cfn.low * 100).toFixed(1)
                    }
                }

                // Progress chart
                new Chart(progressCtx, {
                    type: 'bar',
                    data: {
                        labels: ['S3 Critical', 'S3 High', 'S3 Medium', 'S3 Low', 'CFN Critical', 'CFN High', 'CFN Medium', 'CFN Low'],
                        datasets: [{
                            label: 'Improvement %',
                            data: [
                                parseFloat(progress.s3.critical),
                                parseFloat(progress.s3.high),
                                parseFloat(progress.s3.medium),
                                parseFloat(progress.s3.low),
                                parseFloat(progress.cfn.critical),
                                parseFloat(progress.cfn.high),
                                parseFloat(progress.cfn.medium),
                                parseFloat(progress.cfn.low)
                            ],
                            backgroundColor: [
                                '#dc3545', // Critical - Red
                                '#fd7e14', // High - Orange
                                '#ffc107', // Medium - Yellow
                                '#20c997', // Low - Teal
                                '#dc3545', // Critical - Red
                                '#fd7e14', // High - Orange
                                '#ffc107', // Medium - Yellow
                                '#20c997'  // Low - Teal
                            ]
                        }]
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            title: {
                                display: true,
                                text: 'Improvement Since First Report',
                                font: {
                                    size: 20
                                }
                            },
                            legend: {
                                display: false
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                title: {
                                    display: true,
                                    text: 'Improvement Percentage'
                                }
                            }
                        }
                    }
                })

                // Convert progress canvas to buffer
                const progressBuffer = progressCanvas.toBuffer('image/png')

                // Send progress chart
                // await this.bot.sendPhoto(chatId, progressBuffer, {
                //     caption: '📊 Overall Improvement Progress'
                // })
            }

        } catch (error) {
            console.error('Error generating charts:', error)
        }
    }

    // Send report with visualizations
    private async sendReportWithVisualizations(chatId: number, report: typeof awsReports.$inferSelect) {
        try {
            const reportData = report.report

            if (!reportData) {
                await this.bot.sendMessage(chatId, '❌ No report data found.')
                return
            }


            // Generate and send charts
            await this.generateAndSendCharts(chatId, reportData, report.telegramUserId || '')

            // Send overall statistics
            if (reportData.s3?.overallStatistics) {
                const stats = reportData.s3.overallStatistics
                const statsMessage = `📈 *Overall Statistics*\n\n` +
                    `• Total Buckets Analyzed: ${stats.totalBucketsAnalyzed}\n` +
                    `• Total Recommendations: ${stats.totalRecommendationsMade}\n` +
                    `• Critical Findings: ${stats.findingsByPriority?.critical || 0}\n` +
                    `• High Priority Findings: ${stats.findingsByPriority?.high || 0}\n` +
                    `• Medium Priority Findings: ${stats.findingsByPriority?.medium || 0}\n` +
                    `• Low Priority Findings: ${stats.findingsByPriority?.low || 0}\n\n` +
                    `*Findings by Category:*\n` +
                    `• Security: ${stats.findingsByCategory?.security || 0}\n` +
                    `• Cost: ${stats.findingsByCategory?.cost || 0}\n` +
                    `• Storage: ${stats.findingsByCategory?.storage || 0}\n` +
                    `• Performance: ${stats.findingsByCategory?.performance || 0}\n` +
                    `• Other: ${stats.findingsByCategory?.other || 0}`

                await this.bot.sendMessage(chatId, statsMessage, { parse_mode: 'Markdown' })
            }

            // Send strategic recommendations
            if (reportData.s3?.strategicRecommendations?.length && reportData.s3.strategicRecommendations.length > 0) {
                const recommendations = reportData.s3.strategicRecommendations
                let recommendationsMessage = `🎯 *Strategic Recommendations*\n\n`
                recommendations.forEach((rec: any, index: number) => {
                    recommendationsMessage += `${index + 1}. *${rec.title}*\n` +
                        `${rec.description}\n` +
                        `Impact: ${rec.potentialImpact}\n`
                    if (rec.suggestedActions?.length > 0) {
                        recommendationsMessage += `Suggested Actions:\n${rec.suggestedActions.map((action: string) => `• ${action}`).join('\n')}\n`
                    }
                    recommendationsMessage += '\n'
                })
                await this.bot.sendMessage(chatId, recommendationsMessage, { parse_mode: 'Markdown' })
            }

            // Send detailed bucket analyses
            if (reportData.s3?.detailedBucketAnalyses?.length && reportData.s3.detailedBucketAnalyses.length > 0) {
                const analyses = reportData.s3.detailedBucketAnalyses
                for (const analysis of analyses) {

                    let bucketMessage = `🔍 *Bucket Analysis: ${analysis.bucketName}*\n\n` +
                        `*Overall Assessment:*\n${analysis.summary.overallAssessment}\n\n` +
                        `*Findings by Priority:*\n` +
                        `• Critical: ${analysis.summary.findingsByPriority?.critical || 0}\n` +
                        `• High: ${analysis.summary.findingsByPriority?.high || 0}\n` +
                        `• Medium: ${analysis.summary.findingsByPriority?.medium || 0}\n` +
                        `• Low: ${analysis.summary.findingsByPriority?.low || 0}\n\n` +
                        `*Key Recommendations:*\n`

                    // Add top 3 recommendations
                    const topRecommendations = analysis.recommendations
                        .sort((a, b) => {
                            const priorityOrder: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 }
                            return priorityOrder[a.impact] - priorityOrder[b.impact]
                        })
                        .slice(0, 3)

                    topRecommendations.forEach((rec) => {
                        bucketMessage += `• *${rec.category}* (${rec.impact}): ${rec.description}\n`
                    })

                    await this.bot.sendMessage(chatId, bucketMessage, { parse_mode: 'Markdown' })
                }
            }
        } catch (error) {
            console.error('Error sending report with visualizations:', error)
            await this.bot.sendMessage(chatId, '❌ Error formatting report. Here is the raw report:', { parse_mode: 'Markdown' })
            await this.bot.sendMessage(chatId, 'No report content available')
        }
    }
}

export default InfraGuardianTelegramBot 