// Static assets live at the site root locally, but GitHub Pages serves the
// production export below /AfterTheRoll. next/image does not prepend
// basePath for string `src` values, so this must be part of the URL itself.
const SITE_BASE_PATH = process.env.NODE_ENV === 'production'
  ? (process.env.NEXT_PUBLIC_BASE_PATH ?? '/AfterTheRoll')
  : '';
const MARKS_BASE_PATH = `${SITE_BASE_PATH}/images/shinobigami-marks`;

const MARK_FILES: Record<string, string> = {
  '斜歯忍軍': 'shinobigami_mark_hasuba.png', '鍔鑿組': 'shinobigami_mark_tubanomi.png', '大槌群': 'shinobigami_mark_oozuchigun.png', '指矩班': 'shinobigami_mark_sashiganehan.png', '御釘衆': 'shinobigami_mark_okugisyu.png', '鍵盤勢': 'shinobigami_mark_kenbanzei.png',
  '鞍馬神流': 'shinobigami_marks_kurama.png', '廻鴉': 'shinobigami_marks_mawarigarasu.png', 'バヨネット': 'shinobigami_marks_bayonet.png', '魔王流': 'shinobigami_marks_maouryu.png', '蓮華王拳': 'shinobigami_marks_rengeouken.png', '密蔵番': 'shinobigami_marks_mitsukuraban.png',
  'ハグレモノ': 'shinobigami_marks_hagure.png', '夜顔': 'shinobigami_marks_yorugao.png', 'No.9': 'shinobigami_marks_no9.png', '世界忍者連合': 'shinobigami_marks_sekaininjya.png', '影絵座': 'shinobigami_marks_kageeza.png', '不知火': 'shinobigami_marks_shiranui.png', '咎眼流': 'shinobigami_marks_togame.png', 'ブレーメン': 'shinobigami_marks_bremen.png', '屍衣': 'shinobigami_marks_shroud.png',
  '比良坂機関': 'shinobigami_marks_hirasaka.png', '常夜': 'shinobigami_marks_tokoyo.png', '醜女衆': 'shinobigami_marks_shikome.png', '公安隠密局': 'shinobigami_marks_kouanonmitsu.png', '麝香会総合病院': 'shinobigami_marks_jyakokai.png', '外事N課': 'shinobigami_marks_gaiji_n.png',
  '私立御斎学園': 'shinobigami_marks_otogi.png', '特命臨時教職員派遣委員会': 'shinobigami_marks_tokkkyoi.png', '御斎学園生徒会': 'shinobigami_marks_seitokai.png', '私立多羅尾女学院': 'shinobigami_marks_tarao.png', '旧校舎管理委員会': 'shinobigami_marks_kyukosya.png', 'マクファーデン探偵教室': 'shinobigami_marks_macfaden.png',
  '隠忍の血統': 'shinobigami_marks_oni.png', '土蜘蛛': 'shinobigami_marks_tuchigumo.png', '血社': 'shinobigami_marks_sesa.png', '凶尾': 'shinobigami_marks_magatsubi.png', '長耳': 'shinobigami_marks_nagamimi.png', '縁魔筋': 'shinobigami_marks_enmasuji.png',
};

const KOREAN_MARK_ALIASES: Record<string, keyof typeof MARK_FILES> = {
  '하스바닌군': '斜歯忍軍', '하스바인군': '斜歯忍軍', '하스바본류': '斜歯忍軍', '츠바노미구미': '鍔鑿組', '오오츠치군': '大槌群', '사시가네반': '指矩班', '오쿠기슈': '御釘衆', '켄반세이': '鍵盤勢',
  '쿠라마신류': '鞍馬神流', '마와리가라스': '廻鴉', '바요넷': 'バヨネット', '마왕류': '魔王流', '연화왕권': '蓮華王拳', '미츠쿠라반': '密蔵番',
  '하구레모노': 'ハグレモノ', '요루가오': '夜顔', '야루가오': '夜顔', '세계닌자연합': '世界忍者連合', '카게에자': '影絵座', '시라누이': '不知火', '토가메류': '咎眼流', '브레멘': 'ブレーメン', '슈라우드': '屍衣',
  '히라사카기관': '比良坂機関', '토코요': '常夜', '시키메슈': '醜女衆', '공안은밀국': '公安隠密局', '자코카이종합병원': '麝香会総合病院', '외사n과': '外事N課',
  '사립오토기학원': '私立御斎学園', '특명임시교직원파견위원회': '特命臨時教職員派遣委員会', '오토기학원학생회': '御斎学園生徒会', '사립타라오여학원': '私立多羅尾女学院', '구교사관리위원회': '旧校舎管理委員会', '맥파든탐정교실': 'マクファーデン探偵教室',
  '오니의혈통': '隠忍の血統', '츠치구모': '土蜘蛛', '세샤': '血社', '마가츠비': '凶尾', '나가미미': '長耳', '엔마스지': '縁魔筋',
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[\s\-_/().·・]/g, '');
}

export function getShinobigamiMark(subfaction?: string) {
  if (!subfaction) return undefined;
  const normalizedSubfaction = normalize(subfaction);
  const markName = Object.keys(MARK_FILES).find((name) => normalizedSubfaction.includes(normalize(name)));
  const alias = Object.keys(KOREAN_MARK_ALIASES).find((name) => normalizedSubfaction.includes(normalize(name)));
  const canonicalName = markName ?? (alias ? KOREAN_MARK_ALIASES[alias] : undefined);
  return canonicalName ? `${MARKS_BASE_PATH}/${MARK_FILES[canonicalName]}` : undefined;
}
