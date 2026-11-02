export type ReaderNavigation = {
  page: number;
  fromPage: number;
  direction: number;
  turnId: number;
  turning: boolean;
  targetSpreadRevealed: boolean;
};

type Action =
  | { type: 'move'; offset: number; maxPage: number }
  | { type: 'reveal' | 'finish'; turnId: number };

export const INITIAL_READER_NAVIGATION: ReaderNavigation = {
  page: 0,
  fromPage: 0,
  direction: 1,
  turnId: 0,
  turning: false,
  targetSpreadRevealed: false,
};

export function readerNavigationReducer(state: ReaderNavigation, action: Action): ReaderNavigation {
  if (action.type === 'move') {
    const fromPage = Math.min(state.page, action.maxPage);
    const page = Math.min(action.maxPage, Math.max(0, fromPage + action.offset));
    if (page === fromPage) return state;

    // Every input advances from the last requested spread, even mid-animation.
    return {
      page,
      fromPage,
      direction: page > fromPage ? 1 : -1,
      turnId: state.turnId + 1,
      turning: true,
      targetSpreadRevealed: false,
    };
  }

  // An interrupted animation must never reveal or finish a newer turn.
  if (!state.turning || action.turnId !== state.turnId) return state;
  if (action.type === 'reveal') {
    return state.targetSpreadRevealed ? state : { ...state, targetSpreadRevealed: true };
  }
  return { ...state, turning: false, targetSpreadRevealed: false };
}
