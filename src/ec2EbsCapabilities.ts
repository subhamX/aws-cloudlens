import { z } from 'zod';
import { EC2Client, DescribeInstancesCommand, DescribeVolumesCommand } from '@aws-sdk/client-ec2';
import { drizzleDb } from '../drizzle-db/db';
import {  stagingData } from '../drizzle-db/schema';
import { Agent } from '@openserv-labs/sdk';

export const addEC2EBSCapabilities = (agent: Agent) => {
  agent.addCapability({
    name: 'fetch_ec2_instances_and_ebs_volumes',
    description: 'Step 1: Fetches descriptions of all EC2 instances and EBS volumes. Returns a key to the staged data.',
    schema: z.object({
      accessKeyId: z.string().describe('AWS Access Key ID'),
      secretAccessKey: z.string().describe('AWS Secret Access Key'),
      region: z.string().default('us-east-1').describe('AWS Region'),
    }),
    run: async (params: any) => {
      console.log(`fetch_ec2_instances_and_ebs_volumes starting....`);
      const { accessKeyId, secretAccessKey, region = 'us-east-1' } = params.args;
      const client = new EC2Client({ region, credentials: { accessKeyId, secretAccessKey } });

      const instancesResult = await client.send(new DescribeInstancesCommand({}));
      const volumesResult = await client.send(new DescribeVolumesCommand({}));
      
      const stagingId = crypto.randomUUID();
      await drizzleDb.insert(stagingData).values({
        id: stagingId,
        data: JSON.stringify({
          instances: instancesResult.Reservations?.flatMap(r => r.Instances || []) || [],
          volumes: volumesResult.Volumes || [],
        }),
      });
      
      console.log(`fetch_ec2_instances_and_ebs_volumes done....`);
      return JSON.stringify({ infoOnInstancesAndVolumesKey: stagingId });
    },
  });

//   agent.addCapability({
//     name: 'analyze_ec2_instance_and_volumes',
//     description: 'Step 2: Analyzes a single EC2 instance and its attached volumes based on fetched data. Returns a structured JSON analysis.',
//     schema: z.object({
//       instanceId: z.string().describe('The ID of the EC2 instance to analyze.'),
//       infoOnInstancesAndVolumesKey: z.string().describe('Key for the staged data containing instance and volume information.'),
//     }),
//     run: async (params) => {
//       console.log(`analyze_ec2_instance_and_volumes starting for instance ${params.args.instanceId}....`);
//       const { instanceId, infoOnInstancesAndVolumesKey } = params.args;
      
//       const stagingDataRow = await drizzleDb.select().from(stagingData).where(eq(stagingData.id, infoOnInstancesAndVolumesKey));
//       if (stagingDataRow.length === 0) throw new Error('Staging data not found');
      
//       const allData = JSON.parse(stagingDataRow[0].data || '{}');
//       const instance = allData.instances.find((i: any) => i.InstanceId === instanceId);
//       if (!instance) throw new Error(`Instance with ID ${instanceId} not found in staged data.`);

//       const userPromptContent = `
//         You are an expert AWS EC2 and EBS analyst.
//         Analyze the provided EC2 instance JSON data and generate a comprehensive analysis adhering to the EC2InstanceAnalysisSchema.
        
//         Instance Data:
//         ${JSON.stringify(instance)}

//         Your Task:
//         - Analyze the instance for security, performance, and cost optimization.
//         - Check instance type, state, security groups, and attached EBS volumes.
//         - Identify unattached EBS volumes, overprovisioned instances, etc.
//         - Provide actionable recommendations.
//         - Adhere strictly to the EC2InstanceAnalysisSchema for the output JSON.
//       `;

//       const { model } = getMyModel();
//       const response = await generateObject({
//         model,
//         schema: EC2InstanceAnalysisSchema,
//         prompt: userPromptContent,
//       });

//       console.log(`analyze_ec2_instance_and_volumes done for instance ${params.args.instanceId}....`);
//       return JSON.stringify(response.object);
//     },
//   });

//   agent.addCapability({
//     name: 'create_consolidated_ec2_report',
//     description: 'Step 3: Creates a consolidated report from multiple EC2 instance analyses.',
//     schema: z.object({
//         instanceAnalyses: z.array(EC2InstanceAnalysisSchema).describe('Array of individual EC2 instance analysis objects.'),
//     }),
//     run: async (params) => {
//         console.log(`create_consolidated_ec2_report starting....`);
//         const { instanceAnalyses } = params.args;
//         const currentDate = new Date().toISOString().split('T')[0];

//         const inputSummaryForLLM = instanceAnalyses.map((analysis: z.infer<typeof EC2InstanceAnalysisSchema>) => ({
//             instanceId: analysis.instanceId,
//             instanceType: analysis.instanceType,
//             recommendationsCount: analysis.recommendations.length,
//         }));

//         const userPromptContent = `
//             You are a reporting analyst creating a consolidated AWS EC2 Infrastructure Health Report.
//             The report must be a JSON object strictly adhering to the ConsolidatedEC2ReportSchema.
//             The 'reportDate' will be '${currentDate}'.
//             The 'detailedInstanceAnalyses' will be provided.

//             Summaries of individual instance analyses:
//             ${JSON.stringify(inputSummaryForLLM, null, 2)}

//             Your Tasks:
//             1.  **executiveSummary**: Write a 2-4 paragraph executive summary about the EC2 health.
//             2.  **overallStatistics**: Calculate aggregate stats: total instances, volumes, findings by priority/category.
//             3.  **strategicRecommendations**: Formulate 2-4 high-level strategic recommendations.

//             - Keep the recommendations short and concise.
//             - Give actionable recommendations, and keep them short and concise.
//             - Don't give generic recommendations. Give specific recommendations backed by data. Like X%/Y of objects should be done ZZ etc.
//         `;
        
//         const { model } = getMyModel();
//         const partialReportSchema = ConsolidatedEC2ReportSchema.omit({ detailedInstanceAnalyses: true, unattachedEbsVolumeAnalyses: true });

//         const response = await generateObject({
//             model,
//             schema: partialReportSchema,
//             prompt: userPromptContent,
//         });

//         const finalReport: z.infer<typeof ConsolidatedEC2ReportSchema> = {
//             ...response.object,
//             reportDate: currentDate,
//             detailedInstanceAnalyses: instanceAnalyses,
//             unattachedEbsVolumeAnalyses: [], // Placeholder for now
//         };
        
//         if (finalReport.overallStatistics) {
//             finalReport.overallStatistics.totalInstancesAnalyzed = instanceAnalyses.length;
//         }

//         const taskId = (params.action as any)?.task.id

//         if (!taskId) {
//           throw new Error('Task ID not found');
//         }

//         const oldReport = await drizzleDb.select().from(awsReports).where(eq(awsReports.id, taskId.toString()));

//         const report = {
//           ...oldReport[0].report,
//           ec2: finalReport,
//         }
  
//         await drizzleDb.update(awsReports).set({
//           report,
//           finishedAt: new Date(),
//         }).where(eq(awsReports.id, taskId.toString()));

//         console.log(`create_consolidated_ec2_report done....`);
//         return JSON.stringify(report);
//     }
//   });
};

export default addEC2EBSCapabilities; 