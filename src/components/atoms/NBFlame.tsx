import React from 'react';
import Svg, {Path} from 'react-native-svg';
import {colors} from '../../theme/colors';

interface NBFlameProps {
  size?: number;
  color?: string;
}

const NBFlame: React.FC<NBFlameProps> = ({
  size = 14,
  color = colors.tiger,
}) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16">
      <Path
        d="M8 1.5 C 6 4, 4 5, 4 9 C 4 12, 6 14.5, 8 14.5 C 10 14.5, 12 12, 12 9 C 12 7, 11 6, 10 5 C 9.5 6, 9 6, 8.8 5 C 8.5 3.5, 8.5 2.5, 8 1.5 Z"
        fill={color}
        stroke={colors.text}
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
    </Svg>
  );
};

export default NBFlame;
