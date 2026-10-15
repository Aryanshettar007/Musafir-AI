import { LANGUAGE_IDS, type LanguageId } from "./languages";

export function isGenericVoiceName(name: string): boolean {
  const clean = (name || "").trim().toLowerCase();
  return (
    !clean ||
    clean.startsWith("custom voice") ||
    clean.startsWith("custom_voice") ||
    clean.startsWith("cloned voice") ||
    clean.startsWith("my voice") ||
    clean === "custom" ||
    clean === "voice" ||
    /^voice\s*\d+$/i.test(clean) ||
    /^custom\s*voice\s*\d+$/i.test(clean)
  );
}

export const DEMO_LINES: Record<LanguageId, (name: string, gender?: "male" | "female") => string> = {
  "en-IN": (name) =>
    isGenericVoiceName(name)
      ? "Hi, I'm your Musafir travel companion. Sit back and enjoy the ride."
      : `Hi, I'm ${name}, your Musafir travel companion. Sit back and enjoy the ride.`,

  "hi-IN": (name, gender = "male") =>
    isGenericVoiceName(name)
      ? `नमस्ते! मैं आपका मुसाफ़िर सफ़र का साथी हूँ। आराम से बैठिए और अपनी यात्रा का आनंद लीजिए, रास्ते की कहानियाँ मैं ${gender === "male" ? "सुनाऊँगा" : "सुनाऊँगी"}।`
      : `नमस्ते, मैं ${name} हूँ, आपका मुसाफ़िर सफ़र का साथी। आराम से बैठिए, सफ़र का आनंद लीजिए, कहानियाँ मैं ${gender === "male" ? "सुनाऊँगा" : "सुनाऊँगी"}।`,

  "hi-en": (name, gender = "male") =>
    isGenericVoiceName(name)
      ? `Hey there! Main aapka Musafir travel companion hoon. Let's make your journey awesome, raaste ke best spots aur stories main ${gender === "male" ? "bataunga" : "bataungi"}!`
      : `Hey there! Main ${name} hoon, aapka Musafir travel companion. Let's make your journey awesome, raaste ke best spots aur stories main ${gender === "male" ? "bataunga" : "bataungi"}!`,

  "kn-IN": (name) =>
    isGenericVoiceName(name)
      ? "ನಮಸ್ಕಾರ, ನಾನು ನಿಮ್ಮ ಮುಸಾಫಿರ್ ಪ್ರಯಾಣದ ಜೊತೆಗಾರ. ಆರಾಮವಾಗಿ ಕುಳಿತು ಪ್ರಯಾಣವನ್ನು ಎಂಜಾಯ್ ಮಾಡಿ."
      : `ನಮಸ್ಕಾರ, ನಾನು ${name}, ನಿಮ್ಮ ಮುಸಾಫಿರ್ ಪ್ರಯಾಣದ ಜೊತೆಗಾರ. ಆರಾಮವಾಗಿ ಕುಳಿತು ಪ್ರಯಾಣವನ್ನು ಎಂಜಾಯ್ ಮಾಡಿ.`,

  "ta-IN": (name) =>
    isGenericVoiceName(name)
      ? "வணக்கம், நான் உங்கள் முசாஃபிர் பயணத் துணை. நிம்மதியாக உட்கார்ந்து பயணத்தை ரசியுங்கள்."
      : `வணக்கம், நான் ${name}, உங்கள் முசாஃபிர் பயணத் துணை. நிம்மதியாக உட்கார்ந்து பயணத்தை ரசியுங்கள்.`,

  "te-IN": (name, gender = "male") =>
    isGenericVoiceName(name)
      ? `నమస్కారం, నేను మీ ముసాఫిర్ ప్రయాణ ${gender === "male" ? "సహచరుడిని" : "సహచరిని"}. హాయిగా కూర్చుని ప్రయాణాన్ని ఆస్వాదించండి.`
      : `నమస్కారం, నేను ${name}, మీ ముసాఫిర్ ప్రయాణ ${gender === "male" ? "సహచరుడిని" : "సహచరిని"}. హాయిగా కూర్చుని ప్రయాణాన్ని ఆస్వాదించండి.`,

  "ml-IN": (name, gender = "male") =>
    isGenericVoiceName(name)
      ? `നമസ്കാരം, ഞാൻ നിങ്ങളുടെ മുസാഫിർ യാത്രാ ${gender === "male" ? "കൂട്ടുകാരൻ" : "കൂട്ടുകാരി"}. സുഖമായി ഇരുന്ന് യാത്ര ആസ്വദിക്കൂ.`
      : `നമസ്കാരം, ഞാൻ ${name}, നിങ്ങളുടെ മുസാഫിർ യാത്രാ ${gender === "male" ? "കൂട്ടുകാരൻ" : "കൂട്ടുകാരി"}. സുഖമായി ഇരുന്ന് യാത്ര ആസ്വദിക്കൂ.`,

  "mr-IN": (name, gender = "male") =>
    isGenericVoiceName(name)
      ? `नमस्कार, मी ${gender === "male" ? "तुमचा मुसाफिर प्रवासाचा सोबती" : "तुमची मुसाफिर प्रवासाची सोबतीण"}. आरामात बसा आणि प्रवासाचा आनंद घ्या.`
      : `नमस्कार, मी ${name}, ${gender === "male" ? "तुमचा मुसाफिर प्रवासाचा सोबती" : "तुमची मुसाफिर प्रवासाची सोबतीण"}. आरामात बसा आणि प्रवासाचा आनंद घ्या.`,

  "bn-IN": (name) =>
    isGenericVoiceName(name)
      ? "নমস্কার, আমি আপনার মুসাফির ভ্রমণসঙ্গী। আরাম করে বসুন, যাত্রা উপভোগ করুন।"
      : `নমস্কার, আমি ${name}, আপনার মুসাফির ভ্রমণসঙ্গী। আরাম করে বসুন, যাত্রা উপভোগ করুন।`,

  "gu-IN": (name, gender = "male") =>
    isGenericVoiceName(name)
      ? `નમસ્તે, હું ${gender === "male" ? "તમારો" : "તમારી"} મુસાફિર પ્રવાસ સાથી. આરામથી બેસો અને સફરનો આનંદ માણો.`
      : `નમસ્તે, હું ${name}, ${gender === "male" ? "તમારો" : "તમારી"} મુસાફિર પ્રવાસ સાથી. આરામથી બેસો અને સફરનો આનંદ માણો.`,

  "pa-IN": (name, gender = "male") =>
    isGenericVoiceName(name)
      ? `ਸਤ ਸ੍ਰੀ ਅਕਾਲ, ਮੈਂ ${gender === "male" ? "ਤੁਹਾਡਾ ਮੁਸਾਫ਼ਿਰ ਸਫ਼ਰ ਦਾ ਸਾਥੀ" : "ਤੁਹਾਡੀ ਮੁਸਾਫ਼ਿਰ ਸਫ਼ਰ ਦੀ ਸਾਥਣ"}। ਆਰਾਮ ਨਾਲ ਬੈਠੋ ਅਤੇ ਸਫ਼ਰ ਦਾ ਮਜ਼ਾ ਲਓ।`
      : `ਸਤ ਸ੍ਰੀ ਅਕਾਲ, ਮੈਂ ${name} ਹਾਂ, ${gender === "male" ? "ਤੁਹਾਡਾ ਮੁਸਾਫ਼ਿਰ ਸਫ਼ਰ ਦਾ ਸਾਥੀ" : "ਤੁਹਾਡੀ ਮੁਸਾਫ਼ਿਰ ਸਫ਼ਰ ਦੀ ਸਾਥਣ"}। ਆਰਾਮ ਨਾਲ ਬੈਠੋ ਅਤੇ ਸਫ਼ਰ ਦਾ ਮਜ਼ਾ ਲਓ।`,
};

export function getDemoLine(language: LanguageId, name: string, gender?: "male" | "female"): string {
  const lineFn = DEMO_LINES[language] || DEMO_LINES["en-IN"];
  return lineFn(name, gender);
}

