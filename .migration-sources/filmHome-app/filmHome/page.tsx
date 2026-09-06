import { getFilmHomeImagePaths } from '@/lib/data/images';
import FilmHomeClient from './FilmHomeClient';

export default function FilmHomePage() {
  const imagePaths = getFilmHomeImagePaths();

  return <FilmHomeClient imagePaths={imagePaths} />;
}
