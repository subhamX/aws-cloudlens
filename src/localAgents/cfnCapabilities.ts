import { z } from 'zod';
import { CloudFormationClient, ListStacksCommand, GetTemplateCommand, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { generateObject } from 'ai';
import { getMyModel } from '../utils/myModel';
import { drizzleDb } from '../../drizzle-db/db';
import { awsReports, stagingData } from '../../drizzle-db/schema';
import { eq } from 'drizzle-orm';
import { ConsolidatedCfnReportSchema, CfnStackAnalysisSchema } from './cfnTypes';
import { Agent } from '@openserv-labs/sdk';

export const addCfnCapabilities = (agent: Agent) => {
  agent.addCapability({
    name: 'fetch_cfn_stacks',
    description: 'Step 1: Fetch all CloudFormation stacks in the AWS account.',
    schema: z.object({
      accessKeyId: z.string().describe('AWS Access Key ID'),
      secretAccessKey: z.string().describe('AWS Secret Access Key'),
      region: z.string().default('us-east-1').describe('AWS Region'),
    }),
    run: async (params: any, messages: any) => {
      console.log(`fetch_cfn_stacks starting....`)
      const { accessKeyId, secretAccessKey, region = 'us-east-1' } = params.args;
      const client = new CloudFormationClient({ region, credentials: { accessKeyId, secretAccessKey } });
      const result = await client.send(new ListStacksCommand({}));
      const stacks = (result.StackSummaries?.map((s) => s.StackName) || []).filter(e => e !== undefined) as string[];
      console.log('Found stacks:', stacks);
      console.log(`fetch_cfn_stacks done....`)
      return JSON.stringify({ stacks });
    },
  });

  agent.addCapability({
    name: 'fetch_cfn_template',
    description: 'Step 2: Fetch the CloudFormation template for a specific stack.',
    schema: z.object({
      stackName: z.string().describe('CloudFormation Stack Name'),
      accessKeyId: z.string().describe('AWS Access Key ID'),
      secretAccessKey: z.string().describe('AWS Secret Access Key'),
      region: z.string().default('us-east-1').describe('AWS Region'),
    }),
    run: async (params: any, messages: any) => {
      console.log(`fetch_cfn_template starting....`)
      const { stackName, accessKeyId, secretAccessKey, region = 'us-east-1' } = params.args;
      const client = new CloudFormationClient({ region, credentials: { accessKeyId, secretAccessKey } });
      
      // Get template
      const templateResult = await client.send(new GetTemplateCommand({ StackName: stackName }));
      const template = templateResult.TemplateBody;

      // Get stack details
      const stackResult = await client.send(new DescribeStacksCommand({ StackName: stackName }));
      const stackDetails = stackResult.Stacks?.[0];

      const randomId = crypto.randomUUID();
      await drizzleDb.insert(stagingData).values({
        id: randomId,
        data: JSON.stringify({
          stackName,
          template,
          stackDetails,
        })
      });

      console.log(`fetch_cfn_template done....`)
      return JSON.stringify({
        infoOnStackKey: randomId,
      });
    },
  });

  agent.addCapability({
    name: 'analyze_cfn_stack',
    description: 'Step 3: Analyze a CloudFormation stack template and provide detailed recommendations.',
    schema: z.object({
      stackName: z.string().describe('CloudFormation Stack Name'),
      infoOnStackKey: z.string().describe('Key of the staging data row that contains the stack template and details'),
      accessKeyId: z.string().describe('AWS Access Key ID'),
      secretAccessKey: z.string().describe('AWS Secret Access Key'),
      region: z.string().default('us-east-1').describe('AWS Region'),
    }),
    run: async (params: any, messages: any) => {
      console.log(`analyze_cfn_stack starting....`)
      const { stackName, infoOnStackKey, accessKeyId, secretAccessKey, region = 'us-east-1' } = params.args;
      
      const stagingDataRow = await drizzleDb.select().from(stagingData).where(eq(stagingData.id, infoOnStackKey));
      if (stagingDataRow.length === 0) {
        throw new Error('Staging data row not found');
      }
      const data = JSON.parse(stagingDataRow[0].data || '{}');
      const { template, stackDetails } = data;

      const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

      const userPromptContent = `
You are an expert AWS CloudFormation optimization and security analyst.
Analyze the CloudFormation stack '${stackName}' and provide a comprehensive analysis as a JSON object strictly adhering to the CfnStackAnalysisSchema.
The 'stackName' will be '${stackName}' and 'analysisDate' will be '${currentDate}'.

CloudFormation Template:
${JSON.stringify(template, null, 2)}

Stack Details:
${JSON.stringify(stackDetails, null, 2)}

Your Task:
Generate a JSON object matching the CfnStackAnalysisSchema.
-   **recommendations**: Provide detailed, actionable findings. For each recommendation:
    -   Assign 'category' from: 'Template', 'Security', 'Cost'.
    -   'currentCostImpact' and 'estimatedSavingsImpact' should be qualitative (e.g., "High", "Moderate", "Low", "User to quantify") as precise figures are not derivable from input.
-   **summary**:
    -   'overallAssessment': A brief text summary.
    -   'findingsByPriority': Count your recommendations by their 'impact' field.
    -   'findingsByCategory': Count your recommendations by their 'category' field.
    -   'securityVulnerabilitiesCount': Should match 'findingsByCategory.security'.
    -   'costOptimizationOpportunitiesCount': Should match 'findingsByCategory.cost'.
    -   'templateImprovementsCount': Should match 'findingsByCategory.template'.

Key Analysis Areas:
1.  **Template Structure**: Analyze template organization, resource dependencies, parameter/output definitions, conditions, mappings, intrinsic functions, naming conventions, and tagging standards.
2.  **Security**: Analyze IAM permissions, security groups, network access, encryption, secrets management, public access, resource policies, and compliance.
3.  **Cost Optimization**: Analyze resource sizing, storage, compute types, database configs, caching, auto-scaling, reserved capacity, and cost-effective alternatives.

Important Instructions:
-   Adhere STRICTLY to the CfnStackAnalysisSchema for the output.
-   Focus on actionable recommendations for improvement. Do not praise good configurations.
-   Ensure all recommendation fields are populated appropriately.
-   No "TODOs" in the output.
- Keep the recommendations short and concise.
- Don't give generic recommendations. Give specific recommendations backed by data.
- Current cost estimate and potential savings are IMPORTANT and must be included!
      `.trim();

      const { model } = getMyModel();

      const response = await generateObject({
        model,
        schema: CfnStackAnalysisSchema,
        prompt: userPromptContent,
      });

      // Ensure fixed values are set correctly
      let finalObject = response.object;
      finalObject.stackName = stackName;
      finalObject.analysisDate = currentDate;

      console.log(`analyze_cfn_stack done....`)

      return JSON.stringify(finalObject);
    },
  });

  agent.addCapability({
    name: 'create_a_report_for_all_cfn_stacks',
    description: 'Step 4: Creates a consolidated, structured CloudFormation infrastructure report from multiple stack analyses.',
    schema: z.object({
      stackAnalyses: z.array(CfnStackAnalysisSchema).min(1, "At least one stack analysis is required.").describe('An array of detailed CloudFormation stack analysis objects.'),
    }),
    run: async (params: any, _messages: any) => {
      console.log(`create_a_report_for_all_cfn_stacks starting....`)
      const { stackAnalyses } = params.args;
      const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

      const inputSummaryForLLM = stackAnalyses.map((analysis: z.infer<typeof CfnStackAnalysisSchema>) => ({
        stackName: analysis.stackName,
        overallAssessment: analysis.summary.overallAssessment,
        findingsCountByPriority: analysis.summary.findingsByPriority,
        findingsCountByCategory: analysis.summary.findingsByCategory,
        recommendationsCount: analysis.recommendations.length,
        estimatedMonthlyCost: analysis.statistics.estimatedMonthlyCost,
        estimatedMonthlySavings: analysis.statistics.estimatedMonthlySavings,
      }));

      const userPromptContent = `
You are a reporting analyst tasked with creating a consolidated AWS CloudFormation Infrastructure Health Report.
The report must be a JSON object strictly adhering to the ConsolidatedCfnReportSchema.
The 'reportDate' will be '${currentDate}'.
The 'detailedStackAnalyses' field will be provided to you directly as part of the final structure.

You have received the following summaries of individual stack analyses:
${JSON.stringify(inputSummaryForLLM, null, 2)}

Your Tasks for the JSON output:
1.  **executiveSummary (string)**: Write a 2-4 paragraph executive summary. It should:
    *   Start with a high-level statement about the overall health of the CloudFormation resources.
    *   Mention the total number of stacks analyzed.
    *   Highlight key aggregate numbers (e.g., total critical/high findings, common themes like security gaps or cost optimization opportunities).
    *   Conclude with the potential benefits of addressing the findings.

2.  **overallStatistics (object)**: Calculate and populate these aggregate statistics based *only* on the provided stack analysis summaries:
    *   'totalStacksAnalyzed': Count of stacks in the input.
    *   'totalRecommendationsMade': Sum of 'recommendationsCount' from all stack summaries.
    *   'totalEstimatedMonthlyCost': Sum of all stack costs.
    *   'totalEstimatedMonthlySavings': Sum of all potential savings.
    *   'findingsByPriority': Sum the counts for 'critical', 'high', 'medium', 'low' from all 'findingsCountByPriority' objects.
    *   'findingsByCategory': Sum the counts for 'template', 'security', 'cost' from all 'findingsCountByCategory' objects.
    *   'stacksWithCriticalOrHighFindings': Count how many stacks have at least one critical or high finding.

3.  **strategicRecommendations (array of objects)**: Based on common themes or significant findings observed in the provided summaries, formulate 2-4 high-level strategic recommendations. Each should have:
    *   'title': A concise title.
    *   'description': Explanation of the recommendation.
    *   'potentialImpact': e.g., "Improved Security Posture", "Significant Cost Reduction".
    *   'suggestedActions': (Optional) 1-3 bullet points for action.

Instruction:
-   Focus on accurately calculating aggregate statistics for 'overallStatistics'.
-   The 'detailedStackAnalyses' part of the schema will be filled with the original input data by the calling code.
-   Generate a complete JSON object matching the schema parts you are responsible for.
- Give actionable recommendations, and keep them short and concise.
- Don't give generic recommendations. Give specific recommendations backed by data.
- Current cost estimate and potential savings are IMPORTANT and must be included!
      `.trim();

      const { model } = getMyModel();

      const partialReportSchema = ConsolidatedCfnReportSchema.omit({ detailedStackAnalyses: true });

      const response = await generateObject({
        model,
        schema: partialReportSchema,
        prompt: userPromptContent,
        temperature: 0.2,
      });

      // Combine LLM-generated parts with the original detailed analyses
      const finalReport: z.infer<typeof ConsolidatedCfnReportSchema> = {
        ...response.object,
        reportDate: currentDate,
        detailedStackAnalyses: stackAnalyses,
      };

      // Minor corrections or sanity checks for overallStatistics if needed
      if (finalReport.overallStatistics) {
        finalReport.overallStatistics.totalStacksAnalyzed = stackAnalyses.length;
      }

      console.log(`create_a_report_for_all_cfn_stacks done....`)

      const taskId = (params.action as any)?.task.id

      if (!taskId) {
        throw new Error('Task ID not found');
      }
      const oldReport = await drizzleDb.select().from(awsReports).where(eq(awsReports.id, taskId.toString()));

      const report = {
        ...oldReport[0].report,
        cfn: finalReport,
      }

      await drizzleDb.update(awsReports).set({
        report,
        finishedAt: new Date(),
      }).where(eq(awsReports.id, taskId.toString()));

      return JSON.stringify(report);
    },
  });
};

export default addCfnCapabilities; 