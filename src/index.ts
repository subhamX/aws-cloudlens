import { z } from 'zod'
import { Agent } from '@openserv-labs/sdk'
import 'dotenv/config'
import AwsInfraGuardianAgent from './awsReportAgent'

// Create the agent
const agent = new AwsInfraGuardianAgent()

// // Add sum capability
// agent.addCapability({
//   name: 'sum',
//   description: 'Sums two numbers',
//   schema: z.object({
//     a: z.number(),
//     b: z.number()
//   }),
//   async run({ args }) {
//     return `${args.a} + ${args.b} = ${args.a + args.b}`
//   }
// })

// Start the agent's HTTP server
agent.start()

// async function main() {
//   const sum = await agent.process({
//     messages: [
//       {
//         role: 'user',
//         content: 'add 13 and 29'
//       }
//     ]
//   })

//   console.log('Sum:', sum.choices[0].message.content)
// }

// main().catch(console.error)
