# AfterTheRoll

AfterTheRoll 개인 아카이브의 GitHub Pages 프로젝트입니다.

배포 주소는 `https://flosnidor9.github.io/AfterTheRoll/`입니다. 프로덕션 빌드에서는 `NEXT_PUBLIC_BASE_PATH=/AfterTheRoll`이 적용되며, 내부 라우트는 코드에서 모두 사이트 루트를 기준으로 작성합니다.

## Development

```bash
npm run dev
```

## Deployment

GitHub 저장소의 Pages에서 Build and deployment를 **GitHub Actions**로 설정하세요. 배포 워크플로는 `main` 브랜치 push 시 실행됩니다.

로그·갤러리 업로드는 Google 관리자 로그인과 Cloudflare Worker를 사용합니다. GitHub 토큰은 Worker에 최초 한 번 등록하고, 콘텐츠는 비공개 `Trpg-Logs`의 별도 브랜치에 저장합니다. 새 업로드는 사이트 재빌드를 요청하지 않습니다. 최초 Worker 연결과 사이트 1회 배포가 필요하며, [연결 방법과 기존 자료 처리](docs/live-archive.md)를 참고하세요.

