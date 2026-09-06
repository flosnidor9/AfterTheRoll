import { getMainHomeImagePaths } from '@/lib/data/images';
import MainPageContent from '@/components/MainPageContent';

export default function HomePage() {
  const imagePaths = getMainHomeImagePaths();

  return <MainPageContent imagePaths={imagePaths} />;
}
