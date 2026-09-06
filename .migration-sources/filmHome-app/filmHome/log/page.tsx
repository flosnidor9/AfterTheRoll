import { getAllLogPosts } from '@/lib/logs';
import LogClient from './LogClient';

export default function LogPage() {
  const posts = getAllLogPosts();

  return <LogClient posts={posts} />;
}
