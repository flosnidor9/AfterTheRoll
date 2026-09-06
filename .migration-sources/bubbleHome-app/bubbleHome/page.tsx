import { getFavoriteImagePaths, getStickerImagePaths } from '@/lib/data/images';
import HomeScene from '@/components/HomeScene';

export default function Home() {
  return (
    <main>
      <HomeScene
        imagePaths={getFavoriteImagePaths()}
        stickerPaths={getStickerImagePaths()}
      />
    </main>
  );
}
