# AfterTheRoll

AfterTheRoll 개인 아카이브의 GitHub Pages 프로젝트입니다.

배포 주소는 `https://flosnidor9.github.io/afterTheRoll/`입니다. 프로덕션 빌드에서는 `NEXT_PUBLIC_BASE_PATH=/afterTheRoll`이 적용되며, 내부 라우트는 코드에서 모두 사이트 루트를 기준으로 작성합니다.

## Development

```bash
npm run dev
```

## Deployment

GitHub에서 이 저장소의 이름을 `afterTheRoll`로 변경한 뒤, Pages의 Build and deployment를 **GitHub Actions**로 설정하세요. 배포 워크플로는 `main` 브랜치 push 시 실행됩니다.

TRPG 업로드 기능은 `flosnidor9/afterTheRoll` 저장소에 비밀번호 데이터를 저장하도록 설정되어 있습니다. 저장소를 다른 이름으로 만들 경우 `src/lib/trpgUpload.ts`의 `TRPG_SITE_REPOSITORY`도 같은 이름으로 바꾸세요.

## Separated site sources

filmHome과 bubbleHome의 기존 App Router 라우트는 Next.js가 배포하지 않도록 `.migration-sources/`로 옮겨 두었습니다. 각각의 새 저장소를 만들 때 이 폴더를 출발점으로 사용하고, 관련 컴포넌트와 `public/images/film*`, `public/images/bubble*` 에셋을 함께 옮기면 됩니다.
