import React from 'react';
import Svg, {Path} from 'react-native-svg';
import {colors} from '../../theme/colors';

interface NBChevronProps {
  size?: number;
  color?: string;
}

const NBChevron: React.FC<NBChevronProps> = ({
  size = 16,
  color = colors.text,
}) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16">
      <Path
        d="M5 2 L11 8 L5 14"
        fill="none"
        stroke={color}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
};

export default NBChevron;
