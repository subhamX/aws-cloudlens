import { z } from 'zod'

// Schema for individual recommendations
export const CfnRecommendationCategorySchema = z.enum(['Template', 'Security', 'Cost']);
export const CfnRecommendationSchema = z.object({
    category: CfnRecommendationCategorySchema.describe('Category of the recommendation'),
    subcategory: z.string().describe('Specific subcategory (e.g., IAM, Storage, Structure, etc.)'),
    description: z.string().describe('Description of the issue or optimization point'),
    impact: z.enum(['Critical', 'High', 'Medium', 'Low']).describe('Impact and priority of the finding'),
    affectedResources: z.array(z.string()).optional().describe('List of affected CloudFormation resources'),
    recommendation: z.string().describe('Specific actionable recommendation'),
    currentCostImpact: z.string().describe('Current cost impact (e.g., "High", "Standard storage costs for 1TB")'),
    estimatedSavingsImpact: z.string().describe('Estimated savings (e.g., "Significant", "$X/month estimate", "up to Y% reduction")'),
    remediationSteps: z.string().optional().describe('Steps to remediate (especially for security findings)'),
    complianceImpact: z.string().optional().describe('Potential compliance impact (especially for security findings)'),
    paybackPeriod: z.string().optional().describe('Estimated time to recover costs (for cost-related findings)'),
});

// Schema for the comprehensive CloudFormation stack analysis
export const CfnStackAnalysisSchema = z.object({
    stackName: z.string().describe('Name of the CloudFormation stack'),
    analysisDate: z.string().describe('Date of the analysis (ISO 8601 format: YYYY-MM-DD)'),
    statistics: z.object({
        totalResources: z.number().describe('Total number of resources in the stack'),
        totalParameters: z.number().describe('Total number of parameters defined'),
        totalOutputs: z.number().describe('Total number of outputs defined'),
        estimatedMonthlyCost: z.string().describe('Estimated monthly cost of the stack'),
        estimatedMonthlySavings: z.string().describe('Estimated monthly savings from recommendations'),
    }).describe('Overall statistics for the stack'),
    recommendations: z.array(CfnRecommendationSchema).describe('List of detailed recommendations'),
    summary: z.object({
        overallAssessment: z.string().describe('A brief overall assessment of the stack\'s configuration'),
        findingsByPriority: z.object({
            critical: z.number().default(0),
            high: z.number().default(0),
            medium: z.number().default(0),
            low: z.number().default(0),
        }).describe('Count of findings by priority'),
        findingsByCategory: z.object({
            template: z.number().default(0),
            security: z.number().default(0),
            cost: z.number().default(0),
        }).describe('Count of findings by category'),
        securityVulnerabilitiesCount: z.number().default(0).describe('Number of security vulnerabilities identified'),
        costOptimizationOpportunitiesCount: z.number().default(0).describe('Number of cost optimization opportunities'),
        templateImprovementsCount: z.number().default(0).describe('Number of template structure and best practice improvements'),
    }).describe('Summary of the analysis findings'),
});

// Schema for the consolidated CloudFormation report
export const ConsolidatedCfnReportSchema = z.object({
    reportDate: z.string().describe('Date the consolidated report was generated (YYYY-MM-DD)'),
    executiveSummary: z.string().describe('High-level overview of the CloudFormation infrastructure health and key findings'),
    overallStatistics: z.object({
        totalStacksAnalyzed: z.number().describe('Total number of CloudFormation stacks included in this report'),
        totalRecommendationsMade: z.number().describe('Total number of recommendations across all analyzed stacks'),
        totalEstimatedMonthlyCost: z.string().describe('Total estimated monthly cost across all stacks'),
        totalEstimatedMonthlySavings: z.string().describe('Total estimated monthly savings from all recommendations'),
        findingsByPriority: z.object({
            critical: z.number().default(0),
            high: z.number().default(0),
            medium: z.number().default(0),
            low: z.number().default(0),
        }).describe('Aggregated count of findings by priority across all stacks'),
        findingsByCategory: z.object({
            template: z.number().default(0),
            security: z.number().default(0),
            cost: z.number().default(0),
        }).describe('Aggregated count of findings by category across all stacks'),
        stacksWithCriticalOrHighFindings: z.number().default(0).describe('Number of stacks with at least one critical or high priority finding'),
    }).describe('Aggregated statistics for the analyzed CloudFormation infrastructure'),
    detailedStackAnalyses: z.array(CfnStackAnalysisSchema).describe('Array of individual CloudFormation stack analysis results'),
    strategicRecommendations: z.array(z.object({
        title: z.string().describe('Title of the strategic recommendation'),
        description: z.string().describe('Detailed description of the strategic recommendation and its rationale'),
        potentialImpact: z.string().describe('Potential impact of implementing this strategic recommendation'),
        suggestedActions: z.array(z.string()).optional().describe('Specific actions to take for this strategic recommendation'),
    })).describe('High-level strategic recommendations for improving the overall CloudFormation environment'),
}); 