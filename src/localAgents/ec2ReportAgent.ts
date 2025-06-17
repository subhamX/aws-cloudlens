import { generateText, tool } from 'ai';
import { z } from 'zod';
import { getMyModel } from '../utils/myModel';

const fetchEc2InstanceDetailsTool = tool({
  description: 'Analyze EC2 instance details.',
  parameters: z.object({
    instanceId: z.string().describe('The EC2 instance ID.'),
    state: z.string().describe('The state of the instance.'),
    type: z.string().describe('The instance type.'),
    region: z.string().default('us-east-1').describe('AWS region.'),
  }),
  execute: async ({ instanceId, state, type, region }) => {
    // This tool is a stub for now, as instance details are already provided.
    return { instanceId, state, type, region };
  },
});

class Ec2ReportAgent {
  systemPrompt = `You are an EC2 analysis agent. Analyze the provided EC2 instances for security, best practices, and cost optimization. Output a concise, actionable JSON report for each instance.`;

  async analyzeInstances({ instances, region, accessKeyId, secretAccessKey }: {
    instances: any[];
    region?: string;
    accessKeyId: string;
    secretAccessKey: string;
  }) {
    const { model } = getMyModel();
    const { text, steps } = await generateText({
      model,
      maxSteps: 5,
      prompt: `Analyze the following EC2 instances: ${instances.map(i => i.InstanceId).join(', ')}. For each, check security, IAM roles, public access, and cost optimization.`,
      tools: { fetchEc2InstanceDetails: fetchEc2InstanceDetailsTool },
      system: this.systemPrompt,
    });
    return { text, steps };
  }
}

export default Ec2ReportAgent; 