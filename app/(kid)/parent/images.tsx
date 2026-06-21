import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { Href, useFocusEffect, useRouter } from 'expo-router';
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
  const router = useRouter();
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

  function confirmDeleteImage(image: ExplorationImage) {
    Alert.alert('Xoá ảnh', 'Bạn có chắc chắn muốn xoá ảnh này không?', [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Xoá', style: 'destructive', onPress: () => deleteImage(image) },
    ]);
  }

  async function deleteImage(image: ExplorationImage) {
    try {
      const { error: storageErr } = await supabase.storage
        .from('exploration-images')
        .remove([image.storage_path]);
      if (storageErr) throw storageErr;

      const { error: deleteErr } = await supabase
        .from('exploration_images')
        .delete()
        .eq('id', image.id);
      if (deleteErr) throw deleteErr;

      setImages((prev) => prev.filter((img) => img.id !== image.id));
    } catch (err: any) {
      console.error('[ParentImages] delete error:', err);
      Alert.alert('Lỗi', 'Không thể xoá ảnh: ' + (err?.message ?? String(err)));
    }
  }

  function handlePickAndUpload() {
    Alert.alert('Thêm ảnh', 'Chụp ảnh mới hay chọn từ album?', [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Chụp ảnh', onPress: () => pickAndUpload('camera') },
      { text: 'Chọn từ album', onPress: () => pickAndUpload('library') },
    ]);
  }

  async function uploadAsset(asset: ImagePicker.ImagePickerAsset) {
    if (!user) return;
    const base64 =
      asset.base64 ??
      (await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      }));
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const storagePath = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;

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
  }

  async function pickAndUpload(source: 'camera' | 'library') {
    if (!user) return;

    let result: ImagePicker.ImagePickerResult;
    if (source === 'camera') {
      const { granted } = await ImagePicker.requestCameraPermissionsAsync();
      if (!granted) {
        Alert.alert('Cần quyền camera', 'Vào Cài đặt → ParlEcho → Camera để cho phép chụp ảnh.');
        return;
      }
      result = await ImagePicker.launchCameraAsync({ quality: 0.8, base64: true });
    } else {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        base64: true,
        allowsMultipleSelection: true,
      });
    }
    if (result.canceled || result.assets.length === 0) return;

    setUploading(true);
    try {
      let failCount = 0;
      for (const asset of result.assets) {
        try {
          await uploadAsset(asset);
        } catch (err) {
          console.error('[ParentImages] upload error:', err);
          failCount++;
        }
      }

      await loadImages();
      if (failCount === 0) {
        Alert.alert(
          'Đã tải lên',
          result.assets.length > 1
            ? `Đã tải lên ${result.assets.length} ảnh, đang được kiểm duyệt.`
            : 'Ảnh đang được kiểm duyệt, sẽ dùng được sau khi duyệt xong.',
        );
      } else {
        Alert.alert(
          'Hoàn tất với lỗi',
          `Tải lên thành công ${result.assets.length - failCount}/${result.assets.length} ảnh.`,
        );
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.replace('/(kid)/parent/dashboard' as Href)}
          hitSlop={10}
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ảnh khám phá</Text>
        <View style={{ width: 24 }} />
      </View>
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
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => confirmDeleteImage(item)}
              hitSlop={8}
            >
              <Ionicons name="trash" size={14} color="#fff" />
            </TouchableOpacity>
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
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
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
    deleteBtn: {
      position: 'absolute',
      top: 6,
      right: 6,
      zIndex: 1,
      backgroundColor: colors.error,
      borderRadius: 12,
      padding: 5,
    },
    thumb: { width: '100%', height: 120 },
    statusText: { fontSize: 11, fontWeight: '600', textAlign: 'center', padding: 6 },
  });
