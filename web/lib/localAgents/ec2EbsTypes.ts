import { z } from 'zod';

// Schema for individual recommendations for EC2/EBS
export const EC2RecommendationCategorySchema = z.enum(['Cost', 'Security', 'Performance', 'Best Practices', 'Other']);
export const EC2RecommendationSchema = z.object({
    category: EC2RecommendationCategorySchema.describe('Category of the recommendation'),
    subcategory: z.string().describe('Specific subcategory (e.g., Instance Type, EBS Volume, Security Group)'),
    description: z.string().describe('Description of the issue or optimization point'),
    impact: z.enum(['Critical', 'High', 'Medium', 'Low']).describe('Impact and priority of the finding'),
    affectedResources: z.array(z.string()).optional().describe('List of affected resource IDs (e.g., instance IDs, volume IDs, security group IDs)'),
    recommendation: z.string().describe('Specific actionable recommendation'),
    currentCostImpact: z.string().optional().describe('Qualitative assessment of current cost related to this finding (e.g., "High", "Moderate")'),
    estimatedSavings: z.string().optional().describe('Qualitative or quantitative assessment of potential savings (e.g., "up to 20% reduction", "$50/month")'),
    remediationSteps: z.string().optional().describe('Steps to remediate the issue'),
});

// Schema for the analysis of a single EBS volume
export const EBSVolumeAnalysisSchema = z.object({
    volumeId: z.string().describe('ID of the EBS volume'),
    volumeType: z.string().describe('Type of the EBS volume (e.g., gp2, gp3, io1)'),
    sizeGb: z.number().describe('Size of the volume in GB'),
    iops: z.number().optional().describe('Provisioned IOPS (for io1/io2 volumes)'),
    throughput: z.number().optional().describe('Provisioned throughput (for gp3 volumes)'),
    encrypted: z.boolean().describe('Whether the volume is encrypted'),
    attachmentState: z.enum(['attached', 'detached']).describe('Whether the volume is attached to an instance'),
    attachedInstanceId: z.string().optional().describe('ID of the instance the volume is attached to'),
    recommendations: z.array(EC2RecommendationSchema).describe('List of recommendations for this volume'),
});

// Schema for the analysis of a single EC2 instance
export const EC2InstanceAnalysisSchema = z.object({
    instanceId: z.string().describe('ID of the EC2 instance'),
    instanceType: z.string().describe('Type of the EC2 instance (e.g., t2.micro)'),
    instanceState: z.string().describe('Current state of the instance (e.g., running, stopped)'),
    imageId: z.string().describe('AMI ID of the instance'),
    vpcId: z.string().optional().describe('VPC ID'),
    subnetId: z.string().optional().describe('Subnet ID'),
    securityGroups: z.array(z.object({
        groupId: z.string(),
        groupName: z.string(),
    })).describe('List of associated security groups'),
    publicIpAddress: z.string().optional().describe('Public IP address of the instance'),
    privateIpAddress: z.string().optional().describe('Private IP address of the instance'),
    cpuUtilizationMetricsSummary: z.string().optional().describe('Summary of CPU utilization (e.g., "Average 5%, Peak 20% over last 2 weeks"). Note: Actual metrics not available, this is based on heuristics or provided data.'),
    networkTrafficSummary: z.string().optional().describe('Summary of network traffic. Note: Actual metrics not available.'),
    attachedEbsVolumes: z.array(EBSVolumeAnalysisSchema).describe('List of EBS volumes attached to this instance'),
    recommendations: z.array(EC2RecommendationSchema).describe('List of recommendations for this instance'),
});

// Schema for the consolidated EC2 and EBS report
export const ConsolidatedEC2ReportSchema = z.object({
    reportDate: z.string().describe('Date the consolidated report was generated (YYYY-MM-DD)'),
    executiveSummary: z.string().describe('High-level overview of the EC2 and EBS infrastructure health and key findings.'),
    overallStatistics: z.object({
        totalInstancesAnalyzed: z.number().describe('Total number of EC2 instances included in this report.'),
        totalVolumesAnalyzed: z.number().describe('Total number of EBS volumes included in this report.'),
        unattachedVolumesCount: z.number().describe('Number of EBS volumes not attached to any instance.'),
        totalRecommendationsMade: z.number().describe('Total number of recommendations across all analyzed resources.'),
        findingsByPriority: z.object({
            critical: z.number().default(0),
            high: z.number().default(0),
            medium: z.number().default(0),
            low: z.number().default(0),
        }).describe('Aggregated count of findings by priority.'),
        findingsByCategory: z.object({
            cost: z.number().default(0),
            security: z.number().default(0),
            performance: z.number().default(0),
            'best-practices': z.number().default(0),
            other: z.number().default(0),
        }).describe('Aggregated count of findings by category.'),
    }).describe('Aggregated statistics for the analyzed EC2 and EBS infrastructure.'),
    detailedInstanceAnalyses: z.array(EC2InstanceAnalysisSchema).describe('Array of individual EC2 instance analysis results.'),
    unattachedEbsVolumeAnalyses: z.array(EBSVolumeAnalysisSchema).describe('Array of analyses for unattached EBS volumes.'),
    strategicRecommendations: z.array(z.object({
        title: z.string().describe('Title of the strategic recommendation.'),
        description: z.string().describe('Detailed description of the strategic recommendation and its rationale.'),
        potentialImpact: z.string().describe('Potential impact of implementing this strategic recommendation (e.g., "Improved Security Posture", "Significant Cost Reduction").'),
        suggestedActions: z.array(z.string()).optional().describe('Specific actions to take for this strategic recommendation.'),
    })).describe('High-level strategic recommendations for improving the overall EC2/EBS environment.'),
}); 