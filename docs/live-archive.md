# 로그·갤러리 서버 연결

Google 관리자 로그인 → Cloudflare Worker → 비공개 `flosnidor9/Trpg-Logs` 저장소 순서로 저장합니다. R2, Firebase Storage, D1은 사용하지 않습니다. Firebase는 기존 Google 로그인을 그대로 사용합니다.

2026-11-23: Worker `https://afterroll-archive.papercloud.workers.dev` 배포와 Firebase 프로젝트·관리자 UID·GitHub 토큰 등록을 완료했습니다. 운영 HTTP 검사에서 목록 조회 200, 비로그인 저장 401, 외부 Origin 요청 403을 확인했습니다. 실제 Google 관리자 계정으로 사진/로그를 올리는 화면 검증은 별도로 확인해야 합니다.

새 콘텐츠는 별도 `web-archive` 브랜치의 `web-archive/`에 저장합니다. `main`·`incoming`을 변경하거나 Actions dispatch를 호출하지 않습니다. 현재 Trpg-Logs의 자동화는 `main`·`incoming`만 대상으로 하므로 새 업로드는 사이트 빌드를 요청하지 않습니다. 이 브랜치를 기존 처리 브랜치에 병합하지 마세요.

## 최초 연결

1. Cloudflare 계정에서 Workers Free를 사용합니다. 로컬에서 `npx wrangler login`으로 본인 계정을 연결합니다. R2나 유료 플랜을 활성화할 필요가 없습니다.
2. GitHub에서 **Trpg-Logs 하나만 선택한 fine-grained PAT**를 생성합니다. Repository permissions는 `Contents: Read and write`만 부여합니다. 이 토큰은 Worker에 한 번 등록하며 사이트·환경변수 `NEXT_PUBLIC_*`·채팅에 넣지 않습니다.
3. 아래 명령은 각각 입력 프롬프트를 엽니다. 값을 명령줄 인수나 Git 파일에 직접 작성하지 마세요.

```powershell
npx wrangler secret put GITHUB_TOKEN --config worker/wrangler.jsonc
npx wrangler secret put FIREBASE_PROJECT_ID --config worker/wrangler.jsonc
npx wrangler secret put FIREBASE_API_KEY --config worker/wrangler.jsonc
npx wrangler secret put ADMIN_UID --config worker/wrangler.jsonc
```

`FIREBASE_PROJECT_ID`·`FIREBASE_API_KEY`는 AfterTheRoll에 이미 연결한 Firebase 프로젝트의 값입니다. `ADMIN_UID`는 Firebase Console → Authentication → Users에서 **현재 사이트 관리자 Google 계정의 UID**를 복사합니다. 이메일 주소가 아닙니다. Worker는 서명·대상 프로젝트·만료·Google 로그인·인증된 이메일·UID·사용자 비활성화·세션 폐기를 검사합니다. `src/lib/config/public.ts`의 UI 관리자 이메일과 같은 계정을 지정하세요.

4. `npm run worker:check`로 묶음 생성을 확인한 다음 `npm run worker:deploy`로 배포합니다. 출력된 `https://afterroll-archive.…workers.dev` 주소를 기록합니다. Worker 설정의 `SITE_ORIGIN`은 현재 Pages 원본 주소이며, 하위 경로 `/AfterTheRoll`은 붙이지 않습니다.
5. 로컬 `.env.local`에 **공개 API 주소만** `NEXT_PUBLIC_ARCHIVE_API_URL=…`로 추가합니다. 개발 서버를 재시작합니다. 로컬 API 호출을 허용하려면 `npx wrangler secret put LOCAL_ORIGIN --config worker/wrangler.jsonc`에 `http://localhost:3000` 등 실제 개발 주소 하나를 등록합니다. `worker/.dev.vars.example`은 로컬 Worker용 예시입니다.
6. 사이트를 한 번 빌드·배포합니다. 실제 배포한 Worker 주소 `https://afterroll-archive.papercloud.workers.dev`는 `src/lib/config/public.ts`의 공개 기본값으로 연결해 두었습니다. GitHub Actions에 별도 변수를 등록할 필요가 없습니다. 다른 Worker 주소를 사용할 때만 저장소 → Settings → Secrets and variables → Actions → **Variables**의 `NEXT_PUBLIC_ARCHIVE_API_URL`로 덮어씁니다. 이후 로그·갤러리 변경에는 사이트 재빌드가 필요하지 않습니다.

토큰 만료·폐기 때만 `GITHUB_TOKEN`을 교체합니다. 평소에는 Google 로그인 후 사진·로그를 선택하여 저장하면 됩니다. Worker 관리자 권한을 즉시 중단하려면 `ADMIN_UID`를 변경하거나 Firebase에서 계정을 비활성화/세션 폐기합니다. 브라우저의 관리자 버튼 표시만으로 권한을 허용하지 않습니다.

## Firebase Rules

이 업로드 연결은 Firebase Authentication으로 로그인만 확인하고, 파일·새 로그 비밀번호 보관 정보는 Worker를 통해 GitHub에 저장합니다. 새 Firestore 컬렉션이나 Firebase Storage를 사용하지 않으므로 이 기능을 위해 Firestore/Storage Rules를 추가하거나 배포할 필요가 없습니다. 기존 방명록·플레이·캘린더·정적 로그 비밀번호 보관함의 규칙은 유지합니다. 저장소에는 전체 운영 Rules가 없고 일부 조각만 있으므로 그 조각을 전체 규칙처럼 배포하지 마세요.

## 주소와 기존 자료

- 새 로그는 `/AfterTheRoll/archive/read/?id=UUID`라는 고유 공유 주소를 갖습니다. 링크 직접 열기·새로고침에 별도 동적 HTML 생성이 필요하지 않습니다.
- 새 로그는 목록·플레이 목록·캘린더·캐릭터 연결에서 API 목록을 읽습니다. 태그·CAST·리더·시네마틱 처리는 기존 컴포넌트를 재사용합니다.
- 기존 정적 로그와 갤러리는 계속 표시합니다. 기존 앨범을 처음 수정하면 API에 변경 내용이 저장되고, 이후에는 그 앨범이 정적 목록보다 우선합니다. 변경하지 않은 기존 사진은 기존 Pages 파일을 그대로 참조합니다.
- 기존 로그의 버튼은 **숨김**입니다. API 목록에 숨김 상태를 저장하지만 과거에 배포된 상세 HTML·사진을 회수하지 않습니다. 실제 공개 파일 제거는 기존 저장소/배포에서도 별도로 처리해야 합니다.
- 기존 정적 갤러리 사진도 앨범 삭제만으로 원래 공개 URL에서 사라지지 않습니다. 새 API 사진은 현재 앨범 참조가 없어지면 API 접근을 거부하고 현행 브랜치 파일을 제거합니다.
- 새 API 로그 삭제는 현재 파일과 목록을 함께 제거하며 본문·복구 API를 차단합니다. Git 이력과 이미 내려받은 사본은 남을 수 있습니다.
- 기존 자료 전체를 API 저장소로 이전하는 일은 이번 변경에 포함하지 않습니다. 캐릭터·배포 게시물 업로드는 기존 흐름을 유지합니다.

## 잠긴 로그

비밀번호와 비밀번호 확인을 입력합니다. 기존 마스터키 입력은 **비밀번호 분실 시 복구**를 위해 유지합니다. GitHub 토큰 입력과는 별개입니다.

본문·업로드된 로컬 첨부 이미지·CAST 이미지 정보를 하나로 묶은 뒤 브라우저에서 기존 AES-GCM/PBKDF2 방식으로 암호화합니다. Worker에는 암호문만 전송합니다. 복구용 비밀번호도 마스터키로 별도 암호화하며, 이 암호문은 관리자 인증 API에서만 반환합니다. 마스터키와 복호화된 비밀번호는 Worker에 전달하거나 브라우저 영구 저장소에 보관하지 않습니다. 기존 Firestore 비밀번호 보관함과 정적 로그의 복구 경로는 유지합니다.

목록의 제목·설명·날짜·태그·참가자 이름은 기존처럼 공개 메타데이터입니다. 민감한 내용은 이 필드에 쓰지 마세요. 외부 HTTPS 이미지·음악 주소 자체의 접근권한은 외부 서비스가 관리합니다. 암호화는 외부에 이미 공개된 파일을 비공개로 만들지 않습니다. 공개 API에서 암호문을 내려받을 수 있으므로 추측하기 어려운 로그 비밀번호를 사용해야 합니다. 서버의 호출 제한은 오프라인 비밀번호 대입을 막지 못합니다.

## 용량·운영 한계

- 로그·사진의 파일 용량, 이미지 가로·세로, 총 픽셀 수로 업로드를 제한하지 않습니다. 큰 파일은 자동으로 1MiB씩 나눠 전송합니다. 이는 전송 단위이며 파일 크기 상한이 아닙니다. 모든 조각과 메타데이터를 검증한 다음 한 커밋으로 공개 목록에 반영합니다. 누락·순서 변경·다른 파일 조각 삽입은 서버가 서명된 접수 정보를 검사하여 거부합니다.
- 사이트의 갤러리와 로그 리더는 파일 조각을 개별 요청으로 내려받아 브라우저에서 합칩니다. Worker가 큰 파일 전체를 메모리에 올리지 않으며, 파일 조각은 최종 커밋에 연결하여 GitHub에서 보관합니다. 저장이 완료되기 전의 조각은 공개 API로 읽을 수 없습니다. 취소·실패한 업로드의 연결되지 않은 GitHub blob은 공개되지 않지만 즉시 삭제를 보장하지는 않습니다.
- PNG/JPEG/GIF/WebP 형식 검사는 유지합니다. 서버는 첫 조각의 실제 파일 서명을 확인하고 가능한 경우 헤더에서 해상도를 읽습니다. 헤더가 다음 조각까지 이어지는 파일은 브라우저가 읽은 해상도를 사용합니다. 전체 디코딩/EXIF 제거 파이프라인은 추가하지 않았으며 위치정보 등 원본 메타데이터가 유지될 수 있습니다. 이미지 형식 검사는 파일 크기를 제한하기 위한 처리가 아닙니다.
- 목록은 최대 4MiB, 로그와 앨범은 각각 최대 2000개입니다. GitHub 저장 한도·Git 이력 증가·API 요청 한도도 적용됩니다. 사진이 많거나 방문이 많아지면 별도 최적화가 필요합니다. 무료 Workers의 요청·CPU 한도를 초과하면 기능이 제한될 수 있으며 무제한 무료를 보장하지 않습니다.
- API에는 분당 IP당 조회 600회, 최종 저장 10회, 조각 접수 240회 요청 제한을 둡니다. 조각 전송 중 서버가 대기를 요청하면 업로더는 안내된 시간이 지난 후 같은 조각을 다시 보냅니다. 파일 용량 제한과는 별개의 요청 남용 방지 장치입니다. 비공개/삭제 자료가 공유 캐시에서 재노출되지 않도록 현재 응답은 `private, no-store`입니다. GitHub 원본은 매번 검증된 현재 커밋에서 읽습니다. 큰 파일·다수 이미지 열람은 GitHub API와 Workers 요청 한도를 소비합니다.
- 파일 전체 용량에 별도 상한을 추가하지 않았지만 Cloudflare·GitHub 자체 한도와 브라우저 메모리는 적용됩니다. 매우 큰 이미지의 직접 원본 URL 스트리밍에는 Worker 한 요청의 외부 호출 한도도 적용되므로 사이트 갤러리는 개별 조각 요청을 사용합니다. 관리자 인증·메타데이터 요청은 메모리 보호를 위해 별도로 제한하며, 파일 본문을 이 요청에 한꺼번에 넣지 않습니다. 완전한 무제한 저장·무료 전송을 보장하는 구조는 아닙니다.
- 다른 탭/요청의 동시 저장은 fast-forward 검사로 충돌을 반환하며 강제 덮어쓰지 않습니다. 실패한 요청은 새로고침 후 다시 시도합니다.
- Worker 설정·토큰·관리자 UID 연결과 사이트 최초 배포 전에는 실운영 업로드가 활성화되지 않습니다. 로컬 검증과 실계정 업로드 검증은 구분합니다.

## 검증

```powershell
npm run test:archive
npx tsc --noEmit
npm run worker:check
npm run build
```

연결 후 비로그인/일반 Google 계정의 저장·복구 API 거부, 관리자 업로드·앨범 수정·삭제, 새 로그 주소 직접 열기, 틀린 비밀번호 거부, 첨부 포함 복호화, 삭제 후 본문·사진 API의 404를 확인하세요. 실제 계정과 브라우저 조작이 필요한 검증은 운영 연결 후 수행합니다.

의존성 점검에서는 기존 Next.js 16.1.6 등에 대한 `npm audit` 보안 경고가 확인됐습니다. 이번 기능 변경에서 프레임워크 버전을 함께 올리지는 않았습니다. Pages는 정적 산출물을 제공하지만 개발 서버·추후 서버 운영까지 안전하다는 보증으로 해석하면 안 됩니다.
