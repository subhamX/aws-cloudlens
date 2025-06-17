// Make sure to install the following if you haven't:
// bun add ai @ai-sdk/openai zod @aws-sdk/client-s3 @aws-sdk/client-ec2 @aws-sdk/client-cloudformation @openserv-labs/sdk
import { Agent } from '@openserv-labs/sdk';
import addS3Capabilities from './localAgents/s3Capabilities';
import { addEC2EBSCapabilities } from './localAgents/ec2EbsCapabilities';



export class AwsInfraGuardianAgent extends Agent {
  constructor() {
    super({
      systemPrompt: 'You are the AWS InfraGuardian agent. You orchestrate resource analysis and provide structured, actionable insights for AWS CloudFormation, S3, and EC2.',
      port: 3000,
      apiKey: process.env.OPENSERV_API_KEY_AWS!,
    });
    addS3Capabilities(this);
    addEC2EBSCapabilities(this);

    // TODO: for CloudFormation
  }

  //   async analyzeInfra({ accessKeyId, secretAccessKey, region = 'us-east-1' }: {
  //     accessKeyId: string;
  //     secretAccessKey: string;
  //     region?: string;
  //   }) {
  //     console.log('Analyzing AWS infrastructure...');

  //     // Fetch initial data (delegating to other agents/capabilities for non-S3 for now)
  //     const cfnClient = new CloudFormationClient({ region, credentials: { accessKeyId, secretAccessKey } });
  //     const cfnResult = await cfnClient.send(new ListStacksCommand({}));
  //     const stackNames = (cfnResult.StackSummaries || []).map(s => s.StackName).filter(s => s !== undefined) as string[];

  //     const ec2Client = new EC2Client({ region, credentials: { accessKeyId, secretAccessKey } });
  //     // const ec2Result = await ec2Client.send(new DescribeInstancesCommand({})); // Example
  //     // const runningInstances = (ec2Result.Reservations || []).flatMap(r => /* ... */);

  //     const cfnAgent = new CfnReportLocalAgent();
  //     // const ec2Agent = new Ec2ReportAgent();

  //     const cfnReports = await Promise.all(stackNames.map(stackName =>
  //       cfnAgent.analyzeStack({ stackName, region, accessKeyId, secretAccessKey })
  //     ));

  //     // S3 Analysis Orchestration using new capabilities
  //     let allS3Analyses: z.infer<typeof S3BucketAnalysisSchema>[] = [];
  //     let s3FinalReport: z.infer<typeof ConsolidatedS3ReportSchema> | string = "S3 analysis not run or failed.";

  //     try {
  //       const bucketsResultString = await this.capabilities['fetch_s3_buckets'].run({ args: { accessKeyId, secretAccessKey, region } }, []);
  //       const { buckets: fetchedBucketNames } = JSON.parse(bucketsResultString) as { buckets: string[] };

  //       if (fetchedBucketNames && fetchedBucketNames.length > 0) {
  //         for (const bucketName of fetchedBucketNames) {
  //           const objectsResultString = await this.capabilities['fetch_all_objects_in_s3_bucket'].run({ args: { bucketName, accessKeyId, secretAccessKey, region } }, []);
  //           const { objects: s3Objects } = JSON.parse(objectsResultString) as { objects: string[] };

  //           const s3Analysis = await this.capabilities['analyze_s3_bucket'].run({ args: { bucketName, objects: s3Objects, accessKeyId, secretAccessKey, region } }, []) as z.infer<typeof S3BucketAnalysisSchema>;
  //           allS3Analyses.push(s3Analysis);
  //         }

  //         if (allS3Analyses.length > 0) {
  //           s3FinalReport = await this.capabilities['create_a_report_for_all_s3_buckets'].run({ args: { bucketAnalyses: allS3Analyses } }, []) as z.infer<typeof ConsolidatedS3ReportSchema>;
  //           console.log("S3 Report (structured object):", JSON.stringify(s3FinalReport, null, 2));
  //         } else {
  //           s3FinalReport = "No S3 buckets yielded analysis results.";
  //         }
  //       } else {
  //         s3FinalReport = "No S3 buckets found or filtered for analysis.";
  //       }
  //     } catch (error) {
  //         console.error("Error during S3 analysis orchestration:", error);
  //         s3FinalReport = `S3 analysis failed: ${(error as Error).message}`;
  //     }

  //     return {
  //       cloudFormation: cfnReports, // Assuming this is already structured or a text report
  //       s3: s3FinalReport, // Now a structured object or error string
  //       // ec2: ec2Reports,
  //     };
  //   }
}

export default AwsInfraGuardianAgent;