// Make sure to install the following if you haven't:
// bun add ai @ai-sdk/openai
import { generateText, tool } from 'ai';
import { z } from 'zod';
import { getMyModel } from './utils/myModel';
import {
  S3Client,
  ListBucketsCommand,
} from '@aws-sdk/client-s3';
import {
  EC2Client,
  DescribeInstancesCommand,
} from '@aws-sdk/client-ec2';
import {
  CloudFormationClient,
  ListStacksCommand,
} from '@aws-sdk/client-cloudformation';
import { Agent } from '@openserv-labs/sdk';
import CfnReportLocalAgent from './cfnReportAgent';
import S3ReportAgent from './s3ReportAgent';
import Ec2ReportAgent from './ec2ReportAgent';

// Types for tool parameters
interface AwsToolParams {
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
}

// S3 Tool
const s3Tool = tool({
  description: 'List all S3 buckets in the AWS account',
  parameters: z.object({
    accessKeyId: z.string().describe('AWS Access Key ID'),
    secretAccessKey: z.string().describe('AWS Secret Access Key'),
    region: z.string().default('us-east-1').describe('AWS Region'),
  }),
  execute: async ({ accessKeyId, secretAccessKey, region = 'us-east-1' }: AwsToolParams) => {
    const client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
    const result = await client.send(new ListBucketsCommand({}));
    return {
      buckets: result.Buckets?.map((b) => b.Name) || [],
    };
  },
});

// EC2 Tool
const ec2Tool = tool({
  description: 'List all EC2 instances in the AWS account',
  parameters: z.object({
    accessKeyId: z.string().describe('AWS Access Key ID'),
    secretAccessKey: z.string().describe('AWS Secret Access Key'),
    region: z.string().default('us-east-1').describe('AWS Region'),
  }),
  execute: async ({ accessKeyId, secretAccessKey, region = 'us-east-1' }: AwsToolParams) => {
    const client = new EC2Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
    const result = await client.send(new DescribeInstancesCommand({}));
    const instances =
      result.Reservations?.flatMap((r) =>
        r.Instances?.map((i) => ({
          instanceId: i.InstanceId,
          state: i.State?.Name,
          type: i.InstanceType,
        })) || []
      ) || [];
    return { instances };
  },
});

// CloudFormation Tool
const cloudFormationTool = tool({
  description: 'List all CloudFormation stacks in the AWS account',
  parameters: z.object({
    accessKeyId: z.string().describe('AWS Access Key ID'),
    secretAccessKey: z.string().describe('AWS Secret Access Key'),
    region: z.string().default('us-east-1').describe('AWS Region'),
  }),
  execute: async ({ accessKeyId, secretAccessKey, region = 'us-east-1' }: AwsToolParams) => {
    const client = new CloudFormationClient({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
    const result = await client.send(new ListStacksCommand({}));
    const stacks = result.StackSummaries?.map((s) => ({
      stackName: s.StackName,
      status: s.StackStatus,
    })) || [];
    return { stacks };
  },
});

export class AwsInfraGuardianAgent extends Agent {
  constructor() {
    super({
      systemPrompt: 'You are the AWS InfraGuardian agent. You orchestrate resource analysis by delegating to specialized agents for CloudFormation, S3, and EC2.'
    });
  }

  async analyzeInfra({ accessKeyId, secretAccessKey, region = 'us-east-1' }: {
    accessKeyId: string;
    secretAccessKey: string;
    region?: string;
  }) {
    // Fetch all stack names
    const cfnClient = new CloudFormationClient({ region, credentials: { accessKeyId, secretAccessKey } });
    const cfnResult = await cfnClient.send(new ListStacksCommand({}));
    const stackNames = (cfnResult.StackSummaries || []).map(s => s.StackName).filter(e => e !== undefined);

    // Fetch all S3 bucket names
    const s3Client = new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
    const s3Result = await s3Client.send(new ListBucketsCommand({}));
    const bucketNames = (s3Result.Buckets || []).map(b => b.Name).filter(e => e !== undefined);

    // Fetch all running EC2 instances
    const ec2Client = new EC2Client({ region, credentials: { accessKeyId, secretAccessKey } });
    const ec2Result = await ec2Client.send(new DescribeInstancesCommand({}));
    const runningInstances = (ec2Result.Reservations || []).flatMap(r =>
      (r.Instances || []).filter(i => i.State?.Name === 'running')
    );

    // Delegate to sub-agents
    const cfnAgent = new CfnReportLocalAgent();
    const s3Agent = new S3ReportAgent();
    const ec2Agent = new Ec2ReportAgent();

    const cfnReports = await Promise.all(stackNames.map(stackName =>
      cfnAgent.analyzeStack({ stackName, region, accessKeyId, secretAccessKey })
    ));
    // const s3Reports = await Promise.all(bucketNames.map(bucketName =>
    //   s3Agent.analyzeBucket({ bucketName, region, accessKeyId, secretAccessKey })
    // ));
    // const ec2Reports = await Promise.all(runningInstances.map(instance =>
    //   ec2Agent.analyzeInstance({ instance, region, accessKeyId, secretAccessKey })
    // ));

    return {
      cloudFormation: cfnReports,
    //   s3: s3Reports,
    //   ec2: ec2Reports,
    };
  }
}

export default AwsInfraGuardianAgent; 