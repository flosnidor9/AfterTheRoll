import { redirect } from 'next/navigation';

type Props = {
  params: Promise<{ folderPath?: string[] }>;
};

export async function generateStaticParams() {
  return [{ folderPath: [] }];
}

export default async function AfterTheRollArchivePage({ params }: Props) {
  await params;
  redirect('/');
}
