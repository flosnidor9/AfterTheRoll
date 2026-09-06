import DeploymentArchiveClient from '@/components/deployments/DeploymentArchiveClient';
import { getAllDeploymentPosts } from '@/lib/data/deployments';

export const dynamic = 'force-static';

export default function DeploymentsPage() {
  return <DeploymentArchiveClient posts={getAllDeploymentPosts()} />;
}
