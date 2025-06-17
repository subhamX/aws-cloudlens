import { z } from 'zod';
import { S3Client, ListBucketsCommand, ListObjectsV2Command, GetBucketPolicyCommand, GetBucketAclCommand, GetBucketVersioningCommand, GetBucketLoggingCommand, GetBucketLifecycleConfigurationCommand, GetBucketEncryptionCommand, GetPublicAccessBlockCommand, GetBucketTaggingCommand } from '@aws-sdk/client-s3';
import { generateObject } from 'ai';
import { getMyModel } from '../utils/myModel';
import { drizzleDb } from '../../drizzle-db/db';
import { awsReports, stagingData } from '../../drizzle-db/schema';
import { eq } from 'drizzle-orm';
import { ConsolidatedS3ReportSchema, S3BucketAnalysisSchema } from './s3Types';
import { Agent, Capability } from '@openserv-labs/sdk';





export const addS3Capabilities = (agent: Agent) => {
  agent.addCapability({
    name: 'fetch_s3_buckets',
    description: 'Step 1: Fetch all S3 buckets in the AWS account. For demo, filters to specific buckets.',
    schema: z.object({
      accessKeyId: z.string().describe('AWS Access Key ID'),
      secretAccessKey: z.string().describe('AWS Secret Access Key'),
      region: z.string().default('us-east-1').describe('AWS Region'),
    }),
    run: async (params: any, messages: any) => {
      console.log(`fetch_s3_buckets starting....`)
      const { accessKeyId, secretAccessKey, region = 'us-east-1' } = params.args;
      const client = new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
      const result = await client.send(new ListBucketsCommand({}));
      const buckets = (result.Buckets?.map((b) => b.Name) || []).filter(e => e !== undefined) as string[];
      const filteredBuckets = buckets.filter((b) => b.includes('skyline-subhmx'));
      console.log('Filtered buckets:', filteredBuckets);
      console.log(`fetch_s3_buckets done....`)
      return JSON.stringify({ buckets: filteredBuckets });
    },
  });

  agent.addCapability({
    name: 'fetch_all_objects_in_s3_bucket',
    description: 'Step 2: Fetch all object keys in a S3 bucket. It returns a id, that has reference to all data about this bucket. After this you should call analyze_s3_bucket',
    schema: z.object({
      bucketName: z.string().describe('S3 Bucket Name'),
      accessKeyId: z.string().describe('AWS Access Key ID'),
      secretAccessKey: z.string().describe('AWS Secret Access Key'),
      region: z.string().default('us-east-1').describe('AWS Region'),
    }),
    run: async (params: any, messages: any) => {
      console.log(`fetch_all_objects_in_s3_bucket starting....`)
      const { bucketName, accessKeyId, secretAccessKey, region = 'us-east-1' } = params.args;
      const client = new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
      const result = await client.send(new ListObjectsV2Command({ Bucket: bucketName }));
      console.log(`fetch_all_objects_in_s3_bucket done....`)

      const randomId = crypto.randomUUID();
      await drizzleDb.insert(stagingData).values({
        id: randomId,
        data: JSON.stringify({
          bucketName,
          objects: (result.Contents?.filter(k => k !== undefined) || []) as any[],
        })
      })
      return JSON.stringify({
        infoOnObjectsInThisBucketKey: randomId,
      });
    },
  });

  agent.addCapability({
    name: 'analyze_s3_bucket',
    description: 'Step 3: Fetches S3 bucket configurations and then analyzes the bucket based on its configuration and a list of objects. Returns a structured JSON analysis adhering to S3BucketAnalysisSchema. Once your done with call buckets, you need to call create_a_report_for_all_s3_buckets',
    schema: z.object({
      bucketName: z.string().describe('S3 Bucket Name'),
      infoOnObjectsInThisBucketKey: z.string().describe('Key of the staging data row that contains the list of objects/prefixes in the S3 bucket (can be a sample, up to ~1000 for practical LLM processing)'),
      accessKeyId: z.string().describe('AWS Access Key ID'),
      secretAccessKey: z.string().describe('AWS Secret Access Key'),
      region: z.string().default('us-east-1').describe('AWS Region'),
    }),
    run: async (params: any, messages: any) => {
      console.log(`analyze_s3_bucket starting....`)
      const { bucketName, infoOnObjectsInThisBucketKey, accessKeyId, secretAccessKey, region = 'us-east-1' } = params.args;
      const stagingDataRow = await drizzleDb.select().from(stagingData).where(eq(stagingData.id, infoOnObjectsInThisBucketKey));
      if (stagingDataRow.length === 0) {
        throw new Error('Staging data row not found');
      }
      const data = JSON.parse(stagingDataRow[0].data || '{}');
      const objects = data.objects;

      const s3Client = new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });

      let policyStatus, aclDetails, versioningStatus, loggingStatus, lifecycleStatus, encryptionStatus, publicAccessBlockStatus, tagsStatus;

      try {
        const policy = await s3Client.send(new GetBucketPolicyCommand({ Bucket: bucketName }));
        policyStatus = policy.Policy ? 'Configured (Details not passed to LLM)' : 'Configured but empty';
      } catch (e: any) { policyStatus = e.name === 'NoSuchBucketPolicy' ? 'Not configured' : `Error fetching policy: ${e.name}`; }

      try {
        const acl = await s3Client.send(new GetBucketAclCommand({ Bucket: bucketName }));
        aclDetails = `Owner: ${acl.Owner?.ID}, Grants: ${acl.Grants?.length || 0} (Details not passed to LLM)`;
      } catch (e: any) { aclDetails = `Error fetching ACLs: ${e.name}`; }

      try {
        const versioning = await s3Client.send(new GetBucketVersioningCommand({ Bucket: bucketName }));
        versioningStatus = versioning.Status ? versioning.Status : 'Not explicitly configured';
        if (versioning.MFADelete === 'Enabled') versioningStatus += ' (MFA Delete Enabled)';
      } catch (e: any) { versioningStatus = `Error fetching versioning: ${e.name}`; }

      try {
        const logging = await s3Client.send(new GetBucketLoggingCommand({ Bucket: bucketName }));
        loggingStatus = logging.LoggingEnabled ? `Enabled to ${logging.LoggingEnabled.TargetBucket}/${logging.LoggingEnabled.TargetPrefix}` : 'Not configured';
      } catch (e: any) { loggingStatus = `Error fetching logging: ${e.name}`; }

      try {
        const lc = await s3Client.send(new GetBucketLifecycleConfigurationCommand({ Bucket: bucketName }));
        lifecycleStatus = lc.Rules && lc.Rules.length > 0 ? `${lc.Rules.length} rules configured` : 'No rules configured';
      } catch (e: any) { lifecycleStatus = e.name === 'NoSuchLifecycleConfiguration' ? 'Not configured' : `Error fetching lifecycle: ${e.name}`; }

      try {
        const enc = await s3Client.send(new GetBucketEncryptionCommand({ Bucket: bucketName }));
        encryptionStatus = enc.ServerSideEncryptionConfiguration?.Rules ? 'Default encryption configured' : 'Default encryption not configured';
      } catch (e: any) { encryptionStatus = e.name === 'NoSuchEncryptionConfiguration' ? 'Default encryption not configured' : `Error fetching encryption: ${e.name}`; }

      try {
        const pab = await s3Client.send(new GetPublicAccessBlockCommand({ Bucket: bucketName }));
        publicAccessBlockStatus = pab.PublicAccessBlockConfiguration ? `Configured: ${JSON.stringify(pab.PublicAccessBlockConfiguration)}` : 'Not configured';
      } catch (e: any) { publicAccessBlockStatus = e.name === 'NoSuchPublicAccessBlockConfiguration' ? 'Not configured (recommended to enable)' : `Error fetching PAB: ${e.name}`; }

      try {
        const tags = await s3Client.send(new GetBucketTaggingCommand({ Bucket: bucketName }));
        tagsStatus = tags.TagSet && tags.TagSet.length > 0 ? `${tags.TagSet.length} tags configured` : 'No tags configured';
      } catch (e: any) { tagsStatus = e.name === 'NoSuchTagSet' ? 'No tags configured' : `Error fetching tags: ${e.name}`; }

      const s3ConfigContext = `
        - Bucket Policy Status: ${policyStatus}
        - Bucket ACLs Summary: ${aclDetails}
        - Versioning Status: ${versioningStatus}
        - Server Access Logging Status: ${loggingStatus}
        - Lifecycle Configuration Status: ${lifecycleStatus}
        - Default Encryption Status: ${encryptionStatus}
        - Public Access Block Configuration: ${publicAccessBlockStatus}
        - Tagging Status: ${tagsStatus}
      `.trim().replace(/^ +/gm, '');

      const objectsPreview = objects.join(', ');
      const objectsCount = objects.length;
      const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

      const userPromptContent = `
You are an expert AWS S3 optimization and security analyst.
Analyze the S3 bucket '${bucketName}' and provide a comprehensive analysis as a JSON object strictly adhering to the S3BucketAnalysisSchema.
The 'bucketName' will be '${bucketName}' and 'analysisDate' will be '${currentDate}'.

A list of ${objectsCount} object keys/prefixes was provided for pattern analysis. Preview (up to 30): ${objectsPreview}.

Current Bucket Configuration Status (Note: Full policy/ACL content is not provided, analyze based on status and general best practices):
${s3ConfigContext}

Your Task:
Generate a JSON object matching the S3BucketAnalysisSchema.
-   **recommendations**: Provide detailed, actionable findings. For each recommendation:
    -   Assign 'category' from: 'Storage', 'Security', 'Cost', 'Performance', 'Other'.
    -   'currentCostImpact' and 'estimatedSavingsImpact' should be qualitative (e.g., "High", "Moderate", "Low", "User to quantify") as precise figures are not derivable from input.
-   **summary**:
    -   'overallAssessment': A brief text summary.
    -   'findingsByPriority': Count your recommendations by their 'impact' field.
    -   'findingsByCategory': Count your recommendations by their 'category' field.
    -   'securityVulnerabilitiesCount': Should match 'findingsByCategory.security'.
    -   'costOptimizationOpportunitiesCount': Should match 'findingsByCategory.cost'.
-   **statistics**:
    -   'totalObjectsProvidedForAnalysis': ${objectsCount}.

Key Analysis Areas:
1.  **Storage & Cost Optimization**: Based on object names/patterns (e.g., 'archive/', 'logs/', '.bak', '.tmp', extensions like .parquet, .csv) and lifecycle status, suggest storage class optimizations, small object compaction considerations (if patterns suggest many small files), temporary file cleanup. Evaluate lifecycle rules for optimality (e.g., incomplete multipart upload cleanup, transitions, expirations). If no tags, recommend tagging.
2.  **Security**: Analyze policy/ACL status (recommend configuration if "Not configured" or if ACLs seem overly permissive from summary), versioning (recommend enabling), logging (recommend enabling), public access block (strongly recommend full block if not configured or if permissive), encryption (recommend default encryption). If object names suggest public web content and PAB isn't fully restrictive, recommend CloudFront.

Important Instructions:
-   Adhere STRICTLY to the S3BucketAnalysisSchema for the output.
-   Focus on actionable recommendations for improvement. Do not praise good configurations.
-   Ensure all recommendation fields are populated appropriately.
-   The 'objectCount' in a recommendation can refer to relevant items observed in the *provided* object list/patterns.
-   The 'totalSize' in a recommendation should usually be "User to determine based on full scan".
-   No "TODOs" in the output.
- Keep the recommendations short and concise.
- Don't give generic recommendations. Give specific recommendations backed by data. Like X%/Y of objects should be done ZZ etc.
      `.trim();

      const { model } = getMyModel();

      const response = await generateObject({
        model,
        schema: S3BucketAnalysisSchema,
        prompt: userPromptContent,
      });

      // Ensure fixed values are set correctly, overriding LLM if necessary
      let finalObject = response.object;
      finalObject.bucketName = bucketName; // Enforce correct bucketName
      finalObject.analysisDate = currentDate; // Enforce correct date
      finalObject.statistics.totalObjectsProvidedForAnalysis = objectsCount;

      console.log(`analyze_s3_bucket done....`)

      return JSON.stringify(finalObject);
    },
  });

  agent.addCapability({
    name: 'create_a_report_for_all_s3_buckets',
    description: 'Step 4: Creates a consolidated, structured S3 infrastructure report (JSON object) from multiple S3 bucket analyses. Adheres to ConsolidatedS3ReportSchema.',
    schema: z.object({
      bucketAnalyses: z.array(S3BucketAnalysisSchema).min(1, "At least one bucket analysis is required.").describe('An array of detailed S3 bucket analysis objects.'),
    }),
    run: async (params: any, _messages: any) => {
      console.log(`create_a_report_for_all_s3_buckets starting....`)
      const { bucketAnalyses } = params.args;
      const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

      // Prepare a summary of input for the LLM.
      // The LLM will use this to generate the executive summary and aggregate stats.
      const inputSummaryForLLM = bucketAnalyses.map((analysis: z.infer<typeof S3BucketAnalysisSchema>) => ({
        bucketName: analysis.bucketName,
        overallAssessment: analysis.summary.overallAssessment,
        findingsCountByPriority: analysis.summary.findingsByPriority,
        findingsCountByCategory: analysis.summary.findingsByCategory,
        recommendationsCount: analysis.recommendations.length,
      }));

      const userPromptContent = `
You are a reporting analyst tasked with creating a consolidated AWS S3 Infrastructure Health Report.
The report must be a JSON object strictly adhering to the ConsolidatedS3ReportSchema.
The 'reportDate' will be '${currentDate}'.
The 'detailedBucketAnalyses' field will be provided to you directly as part of the final structure.

You have received the following summaries of individual bucket analyses:
${JSON.stringify(inputSummaryForLLM, null, 2)}

Your Tasks for the JSON output:
1.  **executiveSummary (string)**: Write a 2-4 paragraph executive summary. It should:
    *   Start with a high-level statement about the overall health of the S3 resources.
    *   Mention the total number of buckets analyzed.
    *   Highlight key aggregate numbers (e.g., total critical/high findings, common themes like security gaps or cost optimization opportunities).
    *   Conclude with the potential benefits of addressing the findings.

2.  **overallStatistics (object)**: Calculate and populate these aggregate statistics based *only* on the provided bucket analysis summaries:
    *   'totalBucketsAnalyzed': Count of buckets in the input.
    *   'totalRecommendationsMade': Sum of 'recommendationsCount' from all bucket summaries.
    *   'findingsByPriority': Sum the counts for 'critical', 'high', 'medium', 'low' from all 'findingsCountByPriority' objects.
    *   'findingsByCategory': Sum the counts for 'security', 'cost', 'storage', 'performance', 'other' from all 'findingsCountByCategory' objects.
    *   'bucketsWithCriticalOrHighFindings': Count how many buckets have at least one critical or high finding.

3.  **strategicRecommendations (array of objects)**: Based on common themes or significant findings observed in the provided summaries, formulate 2-4 high-level strategic recommendations. Each should have:
    *   'title': A concise title.
    *   'description': Explanation of the recommendation.
    *   'potentialImpact': e.g., "Improved Security Posture", "Significant Cost Reduction".
    *   'suggestedActions': (Optional) 1-3 bullet points for action.

Instruction:
-   Focus on accurately calculating aggregate statistics for 'overallStatistics'.
-   The 'detailedBucketAnalyses' part of the schema will be filled with the original input data by the calling code. You only need to generate the other parts of the ConsolidatedS3ReportSchema.
-   Generate a complete JSON object matching the schema parts you are responsible for.
- Give actionable recommendations, and keep them short and concise.
- Don't give generic recommendations. Give specific recommendations backed by data. Like X%/Y of objects should be done ZZ etc.
      `.trim();

      const { model } = getMyModel();

      // We ask the LLM to generate the parts it's good at (summary, strategic recs, and aggregated stats)
      // Then we'll combine it with the original detailedBucketAnalyses.
      const partialReportSchema = ConsolidatedS3ReportSchema.omit({ detailedBucketAnalyses: true });

      const response = await generateObject({
        model,
        schema: partialReportSchema,
        prompt: userPromptContent,
        temperature: 0.2,
      });

      // Combine LLM-generated parts with the original detailed analyses
      const finalReport: z.infer<typeof ConsolidatedS3ReportSchema> = {
        ...response.object,
        reportDate: currentDate, // Ensure correct date
        detailedBucketAnalyses: bucketAnalyses, // Add back the detailed analyses
      };

      // Minor corrections or sanity checks for overallStatistics if needed (e.g. ensure totalBucketsAnalyzed matches)
      if (finalReport.overallStatistics) {
        finalReport.overallStatistics.totalBucketsAnalyzed = bucketAnalyses.length;
      }

      console.log(`create_a_report_for_all_s3_buckets done....`)

      const taskId = (params.action as any)?.task.id

      if (!taskId) {
        throw new Error('Task ID not found');
      }
      const oldReport = await drizzleDb.select().from(awsReports).where(eq(awsReports.id, taskId.toString()));

      const report = {
        ...oldReport[0].report,
        s3: finalReport,
      }

      await drizzleDb.update(awsReports).set({
        report,
        finishedAt: new Date(),
      }).where(eq(awsReports.id, taskId.toString()));

      return JSON.stringify(report);
    },
  });
};

export default addS3Capabilities;
