import { drizzleDb } from '@/drizzle-db/db'
import { awsReports } from '@/drizzle-db/schema'
import { eq } from 'drizzle-orm'
import AnalysisDetailClient from './AnalysisDetailClient'
import { HeroHeader } from '@/components/hero5-header'
import { AlertCircle, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default async function AnalysisDetailPage({
    params,
}: {
    params: Promise<{ id: string }>     
}) {
    const { id } = await params
    try {
        const reports = await drizzleDb.select().from(awsReports).where(eq(awsReports.id, id))
        
        if (!reports.length || !reports[0].report) {
            throw new Error('Report not found')
        }

        const report = reports[0].report
        
        return <AnalysisDetailClient initialData={report} />
    } catch (error) {
        console.error('Error fetching report data:', error)
        return (
            <>
                <HeroHeader />
                <div className="bg-background flex items-center justify-center pt-50">
                    <div className="text-center space-y-6 max-w-2xl mx-auto p-8 rounded-xl border bg-card shadow-lg">
                        <div className="flex justify-center">
                            <div className="rounded-full bg-destructive/10 p-3">
                                <AlertCircle className="h-8 w-8 text-destructive" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <h1 className="text-2xl font-semibold text-destructive">Report Not Found</h1>
                            <p className="text-muted-foreground">
                                {error instanceof Error ? error.message : 'Failed to fetch report data'}
                            </p>
                        </div>
                        <div className="space-y-4">
                            <p className="text-sm text-muted-foreground">
                                The report you're looking for might have been removed or the ID is incorrect. Please check the ID provided by the Telegram bot.
                            </p>
                            <div className="flex justify-center gap-4">
                                <Button variant="outline" asChild>
                                    <Link href="/analysis" className="flex items-center gap-2">
                                        <ArrowLeft className="h-4 w-4" />
                                        Back to Reports
                                    </Link>
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </>
        )
    }
} 