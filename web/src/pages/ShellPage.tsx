import { GradientBackground } from '@/components/ui/GradientBackground'
import { GradientText } from '@/components/ui/GradientText'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'

export function ShellPage() {
  return (
    <GradientBackground>
      <div className="p-6">
        <GradientText className="text-3xl font-bold mb-6" colors={['#f8fafc', '#d946ef', '#a855f7']}>
          Shell
        </GradientText>
        <Card>
          <CardHeader>
            <h3 className="font-medium text-dark-100">Interactive Shell</h3>
          </CardHeader>
          <CardBody>
            <p className="text-dark-400 text-center py-8">Select an agent and open shell from agent detail view</p>
          </CardBody>
        </Card>
      </div>
    </GradientBackground>
  )
}