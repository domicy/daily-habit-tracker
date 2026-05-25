import React from 'react';
import {View, Text, Pressable, StyleSheet} from 'react-native';
import type {BottomTabBarProps} from '@react-navigation/bottom-tabs';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {colors} from '../../theme/colors';
import {fontFamily} from '../../theme/typography';
import {radii, borders, shadowOffsets} from '../../theme';
import NBShadow from './NBShadow';

// route.name -> bottom-tab UI metadata. Keeping the testID lookup inside the
// tab bar avoids spreading dead `tabBarButtonTestID` config across the Tab
// navigator config (each route only ever has one canonical id).
const TAB_META: Record<string, {label: string; testID: string}> = {
  Today: {label: 'TODAY', testID: 'tab-today'},
  Streaks: {label: 'STREAKS', testID: 'tab-streaks'},
  Stats: {label: 'STATS', testID: 'tab-stats'},
  Me: {label: 'ME', testID: 'tab-me'},
};

const NBTabBar: React.FC<BottomTabBarProps> = ({state, navigation}) => {
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={[styles.outer, {paddingBottom: Math.max(insets.bottom, 0) + 16}]}>
      <NBShadow
        offsetX={shadowOffsets.sm}
        offsetY={shadowOffsets.sm}
        color={colors.tigerDeep}
        borderRadius={radii.pill}
        style={styles.shadowWrap}>
        <View style={styles.bar}>
          {state.routes.map((route, index) => {
            const meta = TAB_META[route.name] ?? {
              label: route.name.toUpperCase(),
              testID: `tab-${route.name.toLowerCase()}`,
            };
            const isActive = state.index === index;

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!isActive && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            };

            return (
              <Pressable
                key={route.key}
                testID={meta.testID}
                accessibilityRole="button"
                accessibilityState={{selected: isActive}}
                accessibilityLabel={meta.label}
                onPress={onPress}
                android_ripple={{color: colors.regalia, borderless: false}}
                style={[styles.tab, isActive && styles.tabActive]}>
                <View
                  style={[
                    styles.dot,
                    isActive ? styles.dotActive : styles.dotInactive,
                  ]}
                />
                <Text
                  style={[
                    styles.label,
                    isActive ? styles.labelActive : styles.labelInactive,
                  ]}>
                  {meta.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </NBShadow>
    </View>
  );
};

const styles = StyleSheet.create({
  outer: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 0,
  },
  shadowWrap: {
    alignSelf: 'stretch',
  },
  bar: {
    flexDirection: 'row',
    height: 60,
    backgroundColor: colors.darkBg,
    borderRadius: radii.pill,
    borderWidth: borders.thick,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  tabActive: {
    backgroundColor: colors.tiger,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: borders.base,
  },
  dotActive: {
    borderColor: colors.text,
    backgroundColor: colors.text,
  },
  dotInactive: {
    borderColor: colors.regaliaSoft,
    backgroundColor: 'transparent',
  },
  label: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  labelActive: {
    color: colors.text,
  },
  labelInactive: {
    color: colors.regaliaSoft,
  },
});

export default React.memo(NBTabBar, (prev, next) => {
  // React Navigation reuses the same state.routes reference between renders
  // when the route list is unchanged; only state.index differs on tab change.
  // Skip re-render when both are referentially equal.
  return (
    prev.state.index === next.state.index &&
    prev.state.routes === next.state.routes
  );
});
