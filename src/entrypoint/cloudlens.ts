import AwsInfraGuardianAgent from '../awsReportAgent'


const port = parseInt(process.env.PORT || '3000')

console.log(`Starting CloudLens on port ${port}`)

const infraGuardianAwsAgent = new AwsInfraGuardianAgent(port)
infraGuardianAwsAgent.start()
