import React, { useState } from 'react';
import { View, Text, StyleSheet, Dimensions, ScrollView } from 'react-native';
import SignedImage from '@/components/shared/SignedImage';
import { Image } from 'expo-image';
import { staticMapUrl } from '@/lib/staticMap';
import { Colors } from '@/theme/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface PhotoCarouselProps {
  photos: string[];
  height?: number;
  photoDates?: Record<string, string>; // photo URL → ISO date string
  // Shown when there are no photos: a map snapshot of the place
  mapFallback?: { latitude: number; longitude: number };
}

function formatShortDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function PhotoCarousel({ photos, height = 350, photoDates, mapFallback }: PhotoCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (photos.length === 0 && mapFallback) {
    return (
      <View style={[styles.container, { height }]}>
        <Image
          source={{
            uri: staticMapUrl(mapFallback.latitude, mapFallback.longitude, {
              width: Math.round(SCREEN_WIDTH),
              height: Math.round(height),
              zoom: 14.6,
            }),
          }}
          style={[styles.image, { height }]}
          contentFit="cover"
          transition={150}
        />
      </View>
    );
  }

  const handleScroll = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / SCREEN_WIDTH);
    setActiveIndex(index);
  };

  return (
    <View style={[styles.container, { height }]}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {photos.map((uri, i) => (
          <View key={i} style={{ width: SCREEN_WIDTH, height }}>
            <SignedImage
              uri={uri}
              style={[styles.image, { height }]}
              contentFit="cover"
            />
            {photoDates?.[uri] && (
              <View style={styles.dateBadge}>
                <Text style={styles.dateBadgeText}>
                  {formatShortDate(photoDates[uri])}
                </Text>
              </View>
            )}
          </View>
        ))}
      </ScrollView>
      {photos.length > 1 && (
        <View style={styles.dots}>
          {photos.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === activeIndex && styles.dotActive]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    position: 'relative',
  },
  image: {
    width: SCREEN_WIDTH,
  },
  dateBadge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  dateBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  dots: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: {
    backgroundColor: Colors.white,
    width: 20,
    borderRadius: 4,
  },
});
