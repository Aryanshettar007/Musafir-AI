import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { apiClient } from './api';
import { VoiceModel } from './catalog-service';

export interface CreateCustomVoiceParams {
  name: string;
  gender?: 'male' | 'female';
  audioUri: string;
  audioFilename?: string;
  audioMimeType?: string;
  avatarUri?: string;
  avatarMimeType?: string;
}

/**
 * Reads local URI as a base64 string.
 */
async function uriToBase64(uri: string): Promise<string> {
  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    const blob = await res.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const b64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(b64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  const fileInfo = await FileSystem.getInfoAsync(uri);
  if (!fileInfo.exists || fileInfo.size === 0) {
    throw new Error('Selected audio file is empty or missing. Please record or choose another file.');
  }

  return FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

/**
 * Creates a new custom voice clone by uploading the reference audio and metadata to backend.
 */
export async function createCustomVoice(params: CreateCustomVoiceParams): Promise<VoiceModel> {
  const uri = params.audioUri;
  const ext = uri.split('.').pop()?.toLowerCase() || 'm4a';
  let mime = params.audioMimeType;
  if (!mime) {
    if (ext === 'mp3') mime = 'audio/mpeg';
    else if (ext === 'wav') mime = 'audio/wav';
    else if (ext === 'aac') mime = 'audio/aac';
    else if (ext === 'ogg') mime = 'audio/ogg';
    else mime = 'audio/m4a';
  }

  const filename = params.audioFilename || `voice_sample.${ext}`;
  const audioBase64 = await uriToBase64(uri);

  let avatarBase64: string | undefined;
  let avatarMime: string | undefined;

  if (params.avatarUri) {
    try {
      avatarBase64 = await uriToBase64(params.avatarUri);
      const avatarExt = params.avatarUri.split('.').pop()?.toLowerCase() || 'jpg';
      avatarMime = params.avatarMimeType || (avatarExt === 'png' ? 'image/png' : 'image/jpeg');
    } catch (avatarErr) {
      console.warn('[CustomVoiceService] Could not encode avatar, skipping:', avatarErr);
    }
  }

  const res = await apiClient.post<{ success: boolean; data: VoiceModel }>(
    '/voices/custom',
    {
      name: params.name.trim(),
      gender: params.gender || 'male',
      audioBase64,
      audioFilename: filename,
      audioMimeType: mime,
      avatarBase64,
      avatarMimeType: avatarMime,
    },
    {
      timeout: 90000,
    }
  );

  return res.data.data;
}

/**
 * Fetches the user's custom voices from the backend.
 */
export async function fetchUserCustomVoices(): Promise<VoiceModel[]> {
  try {
    const res = await apiClient.get<{ success: boolean; data: VoiceModel[] }>('/voices/custom');
    if (Array.isArray(res?.data?.data)) {
      return res.data.data;
    }
  } catch (err) {
    console.warn('[CustomVoiceService] Failed to fetch custom voices:', err);
  }
  return [];
}

/**
 * Deletes a custom voice by its ID.
 */
export async function deleteCustomVoice(voiceId: string): Promise<boolean> {
  try {
    const res = await apiClient.delete<{ success: boolean; data: { deleted: boolean } }>(
      `/voices/custom/${voiceId}`
    );
    return Boolean(res.data?.data?.deleted);
  } catch (err) {
    console.warn(`[CustomVoiceService] Failed to delete custom voice ${voiceId}:`, err);
    throw err;
  }
}
