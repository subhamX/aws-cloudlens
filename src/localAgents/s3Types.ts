import { z } from 'zod'

// Schema for individual recommendations
export const RecommendationCategorySchema = z.enum(['Storage', 'Security', 'Cost', 'Performance', 'Other']);
export const RecommendationSchema = z.object({
    category: RecommendationCategorySchema.describe('Category of the recommendation'),
    subcategory: z.string().describe('Specific subcategory (e.g., Storage Class, Lifecycle, Access Control)'),
    description: z.string().describe('Description of the issue or optimization point'),
    impact: z.enum(['Critical', 'High', 'Medium', 'Low']).describe('Impact and priority of the finding'),
    affectedPrefixes: z.array(z.string()).optional().describe('List of affected S3 prefixes/objects, if applicable'),
    recommendation: z.string().describe('Specific actionable recommendation'),
    currentCostImpact: z.string().optional().describe('Qualitative assessment of current cost related to this finding (e.g., "High", "Standard storage costs for 1TB")'),
    estimatedSavingsImpact: z.string().optional().describe('Qualitative assessment of potential savings (e.g., "Significant", "$X/month estimate requires user data", "up to Y% reduction")'),
    objectCount: z.number().optional().describe('Number of objects related to this finding from the provided list or context'),
    totalSize: z.string().optional().describe('Total size of objects related to this finding (e.g., "10 GB", or "User to determine based on full scan")'),
    remediationSteps: z.string().optional().describe('Steps to remediate (especially for security findings)'),
    complianceImpact: z.string().optional().describe('Potential compliance impact (especially for security findings)'),
});

// Schema for the comprehensive S3 bucket analysis
export const S3BucketAnalysisSchema = z.object({
    bucketName: z.string().describe('Name of the S3 bucket'),
    analysisDate: z.string().describe('Date of the analysis (ISO 8601 format: YYYY-MM-DD)'),
    statistics: z.object({
        totalObjectsProvidedForAnalysis: z.number().optional().describe('Total number of objects provided in the input list for analysis'),
        totalSizeNote: z.string().default('Actual total size of all objects in the bucket needs to be determined by the user. Analysis is based on provided object list and configurations.').describe('Note about total size determination'),
        estimatedMonthlyCostNote: z.string().default('A precise overall monthly cost estimate requires full bucket metrics. This analysis focuses on qualitative cost implications and potential savings from specific recommendations.').describe('Note about overall estimated monthly cost determination'),
    }).describe('Overall statistics based on provided information for the bucket'),
    recommendations: z.array(RecommendationSchema).describe('List of detailed recommendations'),
    summary: z.object({
        overallAssessment: z.string().describe('A brief overall assessment of the bucket\'s configuration.'),
        totalPotentialSavingsNote: z.string().default('Sum of qualitative or quantitative savings mentioned in recommendations. Precise total savings require deeper analysis and implementation.').describe('Note about total potential savings'),
        findingsByPriority: z.object({
            critical: z.number().default(0),
            high: z.number().default(0),
            medium: z.number().default(0),
            low: z.number().default(0),
        }).describe('Count of findings by priority, derived from recommendations array.'),
        findingsByCategory: z.object({
            security: z.number().default(0),
            cost: z.number().default(0),
            storage: z.number().default(0),
            performance: z.number().default(0),
            other: z.number().default(0),
        }).describe('Count of findings by category, derived from recommendations array.'),
        securityVulnerabilitiesCount: z.number().default(0).describe('Number of security vulnerabilities identified (should match findingsByCategory.security).'),
        costOptimizationOpportunitiesCount: z.number().default(0).describe('Number of cost optimization opportunities (should match findingsByCategory.cost).'),
    }).describe('Summary of the analysis findings'),
});

// Schema for the consolidated S3 report (NEW)
export const ConsolidatedS3ReportSchema = z.object({
    reportDate: z.string().describe('Date the consolidated report was generated (YYYY-MM-DD)'),
    executiveSummary: z.string().describe('High-level overview of the S3 infrastructure health and key findings.'),
    overallStatistics: z.object({
        totalBucketsAnalyzed: z.number().describe('Total number of S3 buckets included in this report.'),
        totalRecommendationsMade: z.number().describe('Total number of recommendations across all analyzed buckets.'),
        findingsByPriority: z.object({
            critical: z.number().default(0),
            high: z.number().default(0),
            medium: z.number().default(0),
            low: z.number().default(0),
        }).describe('Aggregated count of findings by priority across all buckets.'),
        findingsByCategory: z.object({
            security: z.number().default(0),
            cost: z.number().default(0),
            storage: z.number().default(0),
            performance: z.number().default(0),
            other: z.number().default(0),
        }).describe('Aggregated count of findings by category across all buckets. Useful for pie charts.'),
        bucketsWithCriticalOrHighFindings: z.number().default(0).describe('Number of buckets with at least one critical or high priority finding.'),
    }).describe('Aggregated statistics for the analyzed S3 infrastructure.'),
    detailedBucketAnalyses: z.array(S3BucketAnalysisSchema).describe('Array of individual S3 bucket analysis results.'),
    strategicRecommendations: z.array(z.object({
        title: z.string().describe('Title of the strategic recommendation.'),
        description: z.string().describe('Detailed description of the strategic recommendation and its rationale.'),
        potentialImpact: z.string().describe('Potential impact of implementing this strategic recommendation (e.g., Improved Security Posture, Significant Cost Reduction).'),
        suggestedActions: z.array(z.string()).optional().describe('Specific actions to take for this strategic recommendation.'),
    })).describe('High-level strategic recommendations for improving the overall S3 environment.'),
});
