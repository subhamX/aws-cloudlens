import { generateText, tool } from 'ai';
import { z } from 'zod';
import { getMyModel } from './utils/myModel';
import {
    CloudFormationClient,
    DescribeStacksCommand,
    GetTemplateCommand,
} from '@aws-sdk/client-cloudformation';

interface FetchCfnTemplateParams {
  stackName: string;
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
}

const fetchCfnTemplateTool = tool({
  description: "Fetch CloudFormation template and stack details using AWS SDK.",
  parameters: z.object({
    stackName: z.string().describe("The name of the CloudFormation stack to analyze."),
    region: z.string().default("us-east-1").describe("AWS region of the stack."),
    accessKeyId: z.string().describe("AWS Access Key ID"),
    secretAccessKey: z.string().describe("AWS Secret Access Key"),
  }),
  execute: async ({ stackName, region, accessKeyId, secretAccessKey }: FetchCfnTemplateParams) => {
    const client = new CloudFormationClient({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
    const describeCommand = new DescribeStacksCommand({ StackName: stackName });
    const response = await client.send(describeCommand);
    const stack = response.Stacks?.[0];
    if (!stack) throw new Error(`Stack ${stackName} not found in region ${region}`);
    const templateCommand = new GetTemplateCommand({ StackName: stackName });
    const templateResponse = await client.send(templateCommand);
    const templateBody = templateResponse.TemplateBody;
    return {
      stackName,
      region,
      templateBody,
      stackMetadata: {
        creationTime: stack.CreationTime?.toISOString(),
        stackStatus: stack.StackStatus,
        tags: stack.Tags,
        description: stack.Description,
        stackId: stack.StackId,
        outputs: stack.Outputs,
        parameters: stack.Parameters,
      },
    };
  },
});

class CfnReportLocalAgent {
  systemPrompt = `You are a CloudFormation analysis agent. Your job is to thoroughly analyze CloudFormation stacks for security vulnerabilities, cost optimization, best practices, and architectural improvements. Your output must be a detailed, actionable, and prioritized JSON report. Do not repeat yourself. Do not include generic or vague recommendations. For each finding, provide all required details as specified. Always include a comprehensive summary with statistics, cost, and security metrics, and pie chart data for visualization.`;

  async analyzeStack({ stackName, region, accessKeyId, secretAccessKey }: {
    stackName: string;
    region?: string;
    accessKeyId: string;
    secretAccessKey: string;
  }) {
    const { model } = getMyModel();
    const { text, steps } = await generateText({
      model,
      maxSteps: 7,
      prompt: `Analyze the CloudFormation stack \"${stackName}\" for the following:

1. Template Structure and Best Practices:
   - Template organization and structure
   - Resource dependencies and relationships
   - Parameter and output definitions
   - Conditions and mappings usage
   - Intrinsic functions and pseudo parameters
   - Resource naming conventions
   - Tagging standards

2. Security Analysis:
   - IAM permissions and policies
   - Security group configurations
   - Network access controls
   - Encryption settings
   - Secrets management
   - Public access configurations
   - Resource policies
   - Compliance requirements

3. Cost Optimization:
   - Resource sizing and configuration
   - Storage optimization
   - Compute instance types
   - Database configurations
   - Caching strategies
   - Auto-scaling settings
   - Reserved capacity opportunities
   - Cost-effective service alternatives

4. Resource Usage and Potential Bottlenecks

For each finding, provide:
- Category (Template, Security, or Cost)
- Subcategory (e.g., IAM, Storage, Structure, etc.)
- Description of the issue
- Impact and priority (Critical, High, Medium, Low)
- Affected resources
- Specific recommendations
- Current cost and estimated savings (for cost-related findings)
- Remediation steps (for security findings)
- Compliance impact (for security findings)
- Payback period (for cost-related findings)

Generate a comprehensive summary including:
- Stack information (name, version, analysis date)
- Total number of recommendations
- Count of findings by priority
- Total current cost and estimated savings
- Number of security vulnerabilities and compliance issues
- Number of template improvements and best practices violations
- Pie chart data for findings by category and priority (provide as JSON arrays for easy plotting)

Your recommendations must be clear, actionable, and prioritized. Do not include vague or generic suggestions. Be specific and provide concrete examples. Do not repeat yourself. Do not include generic recommendations. Ensure the output is a single, well-structured JSON object with all required fields. Example output structure:

{
  "stackInfo": { ... },
  "recommendations": [
    {
      "category": "Security",
      "subcategory": "IAM",
      "description": "...",
      "impact": "High",
      "priority": "Critical",
      "affectedResources": ["..."],
      "recommendation": "...",
      "currentCost": 100.0,
      "estimatedSavings": 20.0,
      "remediationSteps": "...",
      "complianceImpact": "...",
      "paybackPeriod": "3 months"
    },
    // ...
  ],
  "summary": {
    "totalRecommendations": 10,
    "findingsByPriority": { "Critical": 2, "High": 3, "Medium": 4, "Low": 1 },
    "currentCost": 500.0,
    "estimatedSavings": 120.0,
    "securityVulnerabilities": 2,
    "complianceIssues": 1,
    "templateImprovements": 3,
    "bestPracticeViolations": 2
  },
  "pieChartData": {
    "byCategory": [
      { "category": "Security", "count": 4 },
      { "category": "Cost", "count": 3 },
      { "category": "Template", "count": 3 }
    ],
    "byPriority": [
      { "priority": "Critical", "count": 2 },
      { "priority": "High", "count": 3 },
      { "priority": "Medium", "count": 4 },
      { "priority": "Low", "count": 1 }
    ]
  }
}

If a field is not applicable, omit it. Do not include any TODOs or placeholders. Ensure the analysis is thorough and recommendations are actionable, specific, and not too lengthy.`,
      tools: { fetchCfnTemplate: fetchCfnTemplateTool },
      system: this.systemPrompt,
    });
    return { text, steps };
  }
}

export default CfnReportLocalAgent;