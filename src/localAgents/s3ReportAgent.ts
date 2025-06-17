import { generateText, tool } from 'ai';
import { z } from 'zod';
import { getMyModel } from '../utils/myModel';
import { S3Client, GetBucketLocationCommand, GetBucketAclCommand } from '@aws-sdk/client-s3';

const fetchS3BucketDetailsTool = tool({
  description: 'Fetch S3 bucket details using AWS SDK.',
  parameters: z.object({
    bucketName: z.string().describe('The name of the S3 bucket.'),
    region: z.string().default('us-east-1').describe('AWS region.'),
    accessKeyId: z.string().describe('AWS Access Key ID'),
    secretAccessKey: z.string().describe('AWS Secret Access Key'),
  }),
  execute: async ({ bucketName, region, accessKeyId, secretAccessKey }) => {
    const client = new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
    let location = 'us-east-1';
    try {
      const locRes = await client.send(new GetBucketLocationCommand({ Bucket: bucketName }));
      location = locRes.LocationConstraint || 'us-east-1';
    } catch {}
    let acl = null;
    try {
      acl = await client.send(new GetBucketAclCommand({ Bucket: bucketName }));
    } catch {}
    return { bucketName, location, acl };
  },
});

class S3ReportAgent {
  systemPrompt = `You are an S3 analysis agent. Analyze the provided S3 buckets for security, best practices, and cost optimization. Output a concise, actionable JSON report for each bucket.`;

  async analyzeBucket({ bucketName, region, accessKeyId, secretAccessKey }: {
    bucketName: string;
    region?: string;
    accessKeyId: string;
    secretAccessKey: string;
  }) {
    const { model } = getMyModel();
    const { text, steps } = await generateText({
      model,
      maxSteps: 5,
      prompt: `Analyze the following S3 bucket: ${bucketName}. Check security, public access, ACLs, and cost optimization.`,
      tools: { fetchS3BucketDetails: fetchS3BucketDetailsTool },
      system: this.systemPrompt,
    });
    return { text, steps };
  }
}

export default S3ReportAgent; 