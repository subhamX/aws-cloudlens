'use client'
import { HeroHeader } from '@/components/hero5-header'
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar'
import 'react-circular-progressbar/dist/styles.css'
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Legend,
} from 'recharts'
import { motion } from 'framer-motion'
import { AlertCircle, CloudCog, Database, Server } from 'lucide-react'
import { z } from 'zod'
import { ConsolidatedS3ReportSchema } from '@/lib/localAgents/s3Types'
import { ConsolidatedCfnReportSchema } from '@/lib/localAgents/cfnTypes'
import { ConsolidatedEC2ReportSchema } from '@/lib/localAgents/ec2EbsTypes'

type Ec2Analysis = z.infer<typeof ConsolidatedEC2ReportSchema>
type S3Analysis = z.infer<typeof ConsolidatedS3ReportSchema>
type CfnAnalysis = z.infer<typeof ConsolidatedCfnReportSchema>

interface AnalysisDetailClientProps {
    initialData: {
        ec2?: Ec2Analysis
        s3?: S3Analysis
        cfn?: CfnAnalysis
    }
}

const COLORS = ['#FF8042', '#FFBB28', '#00C49F', '#0088FE']
const PRIORITY_COLORS = {
    Critical: '#FF8042',
    High: '#FFBB28',
    Medium: '#00C49F',
    Low: '#0088FE',
} as const

const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1
        }
    }
}

const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
        y: 0,
        opacity: 1,
        transition: {
            type: "spring",
            stiffness: 100
        }
    }
}

// Custom tooltip component for better visualization
const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white p-3 rounded shadow-lg border">
                <p className="font-medium">{label}</p>
                <p className="text-sm text-gray-600">Count: {payload[0].value}</p>
            </div>
        )
    }
    return null
}

export default function AnalysisDetailClient({ initialData }: AnalysisDetailClientProps) {
    const renderEC2Analysis = (data: Ec2Analysis) => {
        const findingsByPriority = [
            { name: 'Critical', value: data.overallStatistics.findingsByPriority.critical },
            { name: 'High', value: data.overallStatistics.findingsByPriority.high },
            { name: 'Medium', value: data.overallStatistics.findingsByPriority.medium },
            { name: 'Low', value: data.overallStatistics.findingsByPriority.low },
        ]

        const findingsByCategory = Object.entries(data.overallStatistics.findingsByCategory).map(([key, value]) => ({
            name: key.charAt(0).toUpperCase() + key.slice(1),
            value,
        }))

        return (
            <motion.div 
                className="space-y-6"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
            >
                <motion.h2 
                    className="text-2xl font-semibold mb-4 flex items-center gap-2"
                    variants={itemVariants}
                >
                    <Server className="w-6 h-6" />
                    EC2 & EBS Analysis
                </motion.h2>

                <motion.div 
                    className="bg-white rounded-lg p-6 shadow-sm"
                    variants={itemVariants}
                >
                    <h3 className="text-lg font-medium mb-4">Executive Summary</h3>
                    <p className="text-gray-600">{data.executiveSummary}</p>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <motion.div 
                        className="bg-white rounded-lg p-6 shadow-sm"
                        variants={itemVariants}
                    >
                        <h3 className="text-lg font-medium mb-4">Resource Overview</h3>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <span className="text-gray-600">Total Instances</span>
                                <span className="font-medium">{data.overallStatistics.totalInstancesAnalyzed}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-600">Total Volumes</span>
                                <span className="font-medium">{data.overallStatistics.totalVolumesAnalyzed}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-600">Unattached Volumes</span>
                                <span className="font-medium">{data.overallStatistics.unattachedVolumesCount}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-600">Total Recommendations</span>
                                <span className="font-medium">{data.overallStatistics.totalRecommendationsMade}</span>
                            </div>
                        </div>
                    </motion.div>

                    <motion.div 
                        className="bg-white rounded-lg p-6 shadow-sm"
                        variants={itemVariants}
                    >
                        <h3 className="text-lg font-medium mb-4">Findings by Priority</h3>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={findingsByPriority}
                                        cx="50%"
                                        cy="50%"
                                        labelLine={false}
                                        label={({ name, value }) => `${name}: ${value}`}
                                        outerRadius={80}
                                        fill="#8884d8"
                                        dataKey="value"
                                    >
                                        {findingsByPriority.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </motion.div>
                </div>

                <motion.div 
                    className="bg-white rounded-lg p-6 shadow-sm"
                    variants={itemVariants}
                >
                    <h3 className="text-lg font-medium mb-4">Findings by Category</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={findingsByCategory}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" />
                                <YAxis />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="value" fill="#4f46e5">
                                    {findingsByCategory.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </motion.div>

                <motion.div 
                    className="bg-white rounded-lg p-6 shadow-sm"
                    variants={itemVariants}
                >
                    <h3 className="text-lg font-medium mb-4">Instance Details</h3>
                    <div className="space-y-6">
                        {data.detailedInstanceAnalyses.map((instance, index) => (
                            <div key={index} className="border-b pb-4 last:border-b-0">
                                <div className="flex justify-between items-center mb-2">
                                    <h4 className="font-medium">{instance.instanceId}</h4>
                                    <span className={`px-2 py-1 rounded text-xs ${
                                        instance.instanceState === 'running' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                    }`}>
                                        {instance.instanceState}
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <p className="text-gray-600">Instance Type</p>
                                        <p className="font-medium">{instance.instanceType}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-600">CPU Utilization</p>
                                        <p className="font-medium">{instance.cpuUtilizationMetricsSummary || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-600">Network Traffic</p>
                                        <p className="font-medium">{instance.networkTrafficSummary || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-600">Security Groups</p>
                                        <p className="font-medium">{instance.securityGroups.length}</p>
                                    </div>
                                </div>
                                {instance.recommendations.length > 0 && (
                                    <div className="mt-4">
                                        <p className="font-medium mb-2">Recommendations</p>
                                        <div className="space-y-2">
                                            {instance.recommendations.map((rec, idx) => (
                                                <div key={idx} className="text-sm">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`w-2 h-2 rounded-full`} style={{ backgroundColor: PRIORITY_COLORS[rec.impact] }} />
                                                        <span>{rec.description}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </motion.div>
            </motion.div>
        )
    }

    const renderS3Analysis = (data: S3Analysis) => {
        const findingsByPriority = [
            { name: 'Critical', value: data.overallStatistics.findingsByPriority.critical },
            { name: 'High', value: data.overallStatistics.findingsByPriority.high },
            { name: 'Medium', value: data.overallStatistics.findingsByPriority.medium },
            { name: 'Low', value: data.overallStatistics.findingsByPriority.low },
        ]

        const findingsByCategory = Object.entries(data.overallStatistics.findingsByCategory).map(([key, value]) => ({
            name: key.charAt(0).toUpperCase() + key.slice(1),
            value,
        }))

        return (
            <motion.div 
                className="space-y-6 pt-10"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
            >
                <motion.h2 
                    className="text-2xl font-semibold mb-4 flex items-center gap-2"
                    variants={itemVariants}
                >
                    <Database className="w-6 h-6" />
                    S3 Analysis
                </motion.h2>

                <motion.div 
                    className="bg-white rounded-lg p-6 shadow-sm"
                    variants={itemVariants}
                >
                    <h3 className="text-lg font-medium mb-4">Executive Summary</h3>
                    <p className="text-gray-600">{data.executiveSummary}</p>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <motion.div 
                        className="bg-white rounded-lg p-6 shadow-sm"
                        variants={itemVariants}
                    >
                        <h3 className="text-lg font-medium mb-4">Overview</h3>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <span className="text-gray-600">Total Buckets</span>
                                <span className="font-medium">{data.overallStatistics.totalBucketsAnalyzed}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-600">Total Recommendations</span>
                                <span className="font-medium">{data.overallStatistics.totalRecommendationsMade}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-600">Critical/High Finding Buckets</span>
                                <span className="font-medium">{data.overallStatistics.bucketsWithCriticalOrHighFindings}</span>
                            </div>
                        </div>
                    </motion.div>

                    <motion.div 
                        className="bg-white rounded-lg p-6 shadow-sm"
                        variants={itemVariants}
                    >
                        <h3 className="text-lg font-medium mb-4">Findings by Priority</h3>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={findingsByPriority}
                                        cx="50%"
                                        cy="50%"
                                        labelLine={false}
                                        label={({ name, value }) => `${name}: ${value}`}
                                        outerRadius={80}
                                        fill="#8884d8"
                                        dataKey="value"
                                    >
                                        {findingsByPriority.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </motion.div>
                </div>

                <motion.div 
                    className="bg-white rounded-lg p-6 shadow-sm"
                    variants={itemVariants}
                >
                    <h3 className="text-lg font-medium mb-4">Findings by Category</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={findingsByCategory}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" />
                                <YAxis />
                                <Tooltip />
                                <Bar dataKey="value" fill="#4f46e5" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </motion.div>

                <motion.div 
                    className="bg-white rounded-lg p-6 shadow-sm"
                    variants={itemVariants}
                >
                    <h3 className="text-lg font-medium mb-4">Bucket Details</h3>
                    <div className="space-y-6 flex-col">
                        {data.detailedBucketAnalyses.map((bucket, index) => (
                            <div key={index} className="border-b pb-4 last:border-b-0">
                                <div className="flex justify-between items-center mb-2">
                                    <h4 className="font-medium">{bucket.bucketName}</h4>
                                    <div className="flex items-center gap-4">
                                        <span className="text-sm text-gray-600">
                                            {bucket.statistics.totalObjectsProvidedForAnalysis || 0} objects analyzed
                                        </span>
                                       {bucket.statistics.totalSizeNote.length <= 100 && <span className="text-sm text-gray-600">
                                            {bucket.statistics.totalSizeNote}
                                        </span>}
                                    </div>
                                </div>
                                <p className="text-sm text-gray-600 mb-4">{bucket.summary.overallAssessment}</p>
                                {bucket.recommendations.length > 0 && (
                                    <div>
                                        <p className="font-medium mb-2">Recommendations</p>
                                        <div className="space-y-2">
                                            {bucket.recommendations.map((rec, idx) => (
                                                <div key={idx} className="text-sm">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`w-2 h-2 rounded-full`} style={{ backgroundColor: PRIORITY_COLORS[rec.impact] }} />
                                                        <span>{rec.description}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </motion.div>
            </motion.div>
        )
    }

    const renderCloudFormationAnalysis = (data: CfnAnalysis) => {
        const findingsByPriority = [
            { name: 'Critical', value: data.overallStatistics.findingsByPriority.critical },
            { name: 'High', value: data.overallStatistics.findingsByPriority.high },
            { name: 'Medium', value: data.overallStatistics.findingsByPriority.medium },
            { name: 'Low', value: data.overallStatistics.findingsByPriority.low },
        ]

        const findingsByCategory = Object.entries(data.overallStatistics.findingsByCategory).map(([key, value]) => ({
            name: key.charAt(0).toUpperCase() + key.slice(1),
            value,
        }))

        return (
            <motion.div 
                className="space-y-6"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
            >
                <motion.h2 
                    className="text-2xl font-semibold mb-4 flex items-center gap-2"
                    variants={itemVariants}
                >
                    <CloudCog className="w-6 h-6" />
                    CloudFormation Analysis
                </motion.h2>

                <motion.div 
                    className="bg-white rounded-lg p-6 shadow-sm"
                    variants={itemVariants}
                >
                    <h3 className="text-lg font-medium mb-4">Executive Summary</h3>
                    <p className="text-gray-600">{data.executiveSummary}</p>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <motion.div 
                        className="bg-white rounded-lg p-6 shadow-sm"
                        variants={itemVariants}
                    >
                        <h3 className="text-lg font-medium mb-4">Overview</h3>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <span className="text-gray-600">Total Stacks</span>
                                <span className="font-medium">{data.overallStatistics.totalStacksAnalyzed}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-600">Total Recommendations</span>
                                <span className="font-medium">{data.overallStatistics.totalRecommendationsMade}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-600">Critical/High Finding Stacks</span>
                                <span className="font-medium">{data.overallStatistics.stacksWithCriticalOrHighFindings}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-600">Total Monthly Cost</span>
                                <span className="font-medium">{data.overallStatistics.totalEstimatedMonthlyCost}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-600">Potential Monthly Savings</span>
                                <span className="font-medium text-green-600">{data.overallStatistics.totalEstimatedMonthlySavings}</span>
                            </div>
                        </div>
                    </motion.div>

                    <motion.div 
                        className="bg-white rounded-lg p-6 shadow-sm"
                        variants={itemVariants}
                    >
                        <h3 className="text-lg font-medium mb-4">Findings by Priority</h3>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={findingsByPriority}
                                        cx="50%"
                                        cy="50%"
                                        labelLine={false}
                                        label={({ name, value }) => `${name}: ${value}`}
                                        outerRadius={80}
                                        fill="#8884d8"
                                        dataKey="value"
                                    >
                                        {findingsByPriority.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </motion.div>
                </div>

                <motion.div 
                    className="bg-white rounded-lg p-6 shadow-sm"
                    variants={itemVariants}
                >
                    <h3 className="text-lg font-medium mb-4">Findings by Category</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={findingsByCategory}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" />
                                <YAxis />
                                <Tooltip />
                                <Bar dataKey="value" fill="#4f46e5" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </motion.div>

                <motion.div 
                    className="bg-white rounded-lg p-6 shadow-sm"
                    variants={itemVariants}
                >
                    <h3 className="text-lg font-medium mb-4">Stack Details</h3>
                    <div className="space-y-6">
                        {data.detailedStackAnalyses.map((stack, index) => (
                            <div key={index} className="border-b pb-4 last:border-b-0">
                                <div className="flex justify-between items-center mb-2">
                                    <h4 className="font-medium">{stack.stackName}</h4>
                                    <div className="flex items-center gap-4">
                                        <span className="text-sm text-gray-600">
                                            Cost: {stack.statistics.estimatedMonthlyCost}
                                        </span>
                                        <span className="text-sm text-green-600">
                                            Potential Savings: {stack.statistics.estimatedMonthlySavings}
                                        </span>
                                    </div>
                                </div>
                                <p className="text-sm text-gray-600 mb-4">{stack.summary.overallAssessment}</p>
                                {stack.recommendations.length > 0 && (
                                    <div>
                                        <p className="font-medium mb-2">Recommendations</p>
                                        <div className="space-y-2">
                                            {stack.recommendations.map((rec, idx) => (
                                                <div key={idx} className="text-sm">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`w-2 h-2 rounded-full`} style={{ backgroundColor: PRIORITY_COLORS[rec.impact] }} />
                                                        <span>{rec.description}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </motion.div>
            </motion.div>
        )
    }

    return (
        <main className="min-h-screen bg-gradient-to-b from-background to-background/80">
            <HeroHeader />
            <div className="container mx-auto px-4 py-8">
                <div className="space-y-12">
                    {initialData.ec2 && renderEC2Analysis(initialData.ec2)}
                    {initialData.s3 && renderS3Analysis(initialData.s3)}
                    {initialData.cfn && renderCloudFormationAnalysis(initialData.cfn)}
                </div>
            </div>
        </main>
    )
} 