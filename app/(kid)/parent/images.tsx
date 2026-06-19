import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../../lib/supabase';
import { ExplorationImage } from '../../../lib/types';
import { useAuth } from '../../../providers/AuthProvider';
import { useTheme } from '../../../providers/ThemeProvider';

export default function ParentImagesScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const { user } = useAuth();
  const [images, setImages] = useState<ExplorationImage[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);

  const loadImages = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('exploration_images')
      .select('*')
      .eq('uploader', user.id)
      .order('created_at', { ascending: false });
    if (!data) return;
    setImages(data as ExplorationImage[]);
    const urls: Record<string, string> = {};
    for (const img of data as ExplorationImage[]) {
      const { data: pub } = supabase.storage
        .from('exploration-images')
        .getPublicUrl(img.storage_path);
      urls[img.id] = pub.publicUrl;
    }
    setImageUrls(urls);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadImages();
    }, [loadImages]),
  );

  async function handlePickAndUpload() {
    if (!user) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      base64: true,
    });
    if (result.canceled || !result.assets[0]) return;

    setUploading(true);
    try {
      const asset = result.assets[0];
      const base64 =
        asset.base64 ??
        (await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64,
        }));
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const storagePath = `${user.id}/${Date.now()}.jpg`;

      const { error: uploadErr } = await supabase.storage
        .from('exploration-images')
        .upload(storagePath, bytes.buffer as ArrayBuffer, { contentType: 'image/jpeg' });
      if (uploadErr) throw uploadErr;

      const { data: inserted, error: insertErr } = await supabase
        .from('exploration_images')
        .insert({ uploader: user.id, storage_path: storagePath, is_approved: false })
        .select('id')
        .single();
      if (insertErr || !inserted) throw insertErr ?? new Error('Insert failed');

      const { error: modErr } = await supabase.functions.invoke('image-moderation', {
        body: { exploration_image_id: inserted.id },
      });
      if (modErr) console.warn('[ParentImages] moderation error:', modErr);

      await loadImages();
      Alert.alert('Đã tải lên', 'Ảnh đang được kiểm duyệt, sẽ dùng được sau khi duyệt xong.');
    } catch (err) {
      console.error('[ParentImages] upload error:', err);
      Alert.alert('Lỗi', 'Không thể tải ảnh lên.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: 'Ảnh khám phá' }} />
      <TouchableOpacity style={styles.uploadBtn} onPress={handlePickAndUpload} disabled={uploading}>
        {uploading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
            <Text style={styles.uploadBtnText}>Tải ảnh mới lên</Text>
          </>
        )}
      </TouchableOpacity>

      <FlatList
        data={images}
        keyExtractor={(img) => img.id}
        numColumns={2}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>Chưa có ảnh nào.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            {imageUrls[item.id] ? (
              <Image source={{ uri: imageUrls[item.id] }} style={styles.thumb} resizeMode="cover" />
            ) : null}
            <Text
              style={[
                styles.statusText,
                { color: item.is_approved ? colors.success : colors.warning },
              ]}
            >
              {item.is_approved ? '✅ Đã duyệt' : '⏳ Đang chờ duyệt'}
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    uploadBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.primary,
      borderRadius: 12,
      padding: 14,
      margin: 16,
    },
    uploadBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    list: { paddingHorizontal: 12, paddingBottom: 24, gap: 12 },
    empty: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 40 },
    card: {
      flex: 1,
      margin: 4,
      backgroundColor: colors.surface,
      borderRadius: 12,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
    },
    thumb: { width: '100%', height: 120 },
    statusText: { fontSize: 11, fontWeight: '600', textAlign: 'center', padding: 6 },
  });
