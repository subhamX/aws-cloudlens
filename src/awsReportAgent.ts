// Make sure to install the following if you haven't:
// bun add ai @ai-sdk/openai zod @aws-sdk/client-s3 @aws-sdk/client-ec2 @aws-sdk/client-cloudformation @openserv-labs/sdk
import { Agent } from '@openserv-labs/sdk';
import addS3Capabilities from './localAgents/s3Capabilities';
import addCfnCapabilities from './localAgents/cfnCapabilities';
import addEC2EBSCapabilities from './localAgents/ec2EbsCapabilities';


export class AwsInfraGuardianAgent extends Agent {
  constructor(port: number) {
    super({
      systemPrompt: 'You are the AWS InfraGuardian agent. You orchestrate resource analysis and provide structured, actionable insights for AWS CloudFormation, S3, and EC2.',
      port: port,
      apiKey: process.env.OPENSERV_API_KEY_AWS!,
    });
    addS3Capabilities(this);
    // addEC2EBSCapabilities(this);
    addCfnCapabilities(this);
  }
}

export default AwsInfraGuardianAgent;