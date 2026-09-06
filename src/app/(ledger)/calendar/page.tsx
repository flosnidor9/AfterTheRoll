import CalendarSection from '@/components/calendar/CalendarSection';
import { getAllTrpgPosts } from '@/lib/data/trpg';
import { getCharacters } from '@/lib/data/characters';
import { toGalleryPath } from '@/lib/galleryPath';

export const dynamic = 'force-static';

export default function AfterTheRollCalendarPage() {
  const logLinks = getAllTrpgPosts().map((post) => ({
    calendarEventId: post.calendarEventId,
    playId: post.playId,
    href: `/archive/read/${toGalleryPath(post.fullSlug)}`,
  }));

  return <CalendarSection logLinks={logLinks} characters={getCharacters()} />;
}
