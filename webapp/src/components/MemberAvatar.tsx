interface MemberAvatarProps {
  name: string;
  color: string;
  size?: number;
}

export function MemberAvatar({ name, color, size = 24 }: MemberAvatarProps) {
  const initial = name.trim()[0]?.toUpperCase() ?? '?';
  return (
    <span
      aria-label={name}
      title={name}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        minWidth: size,
        borderRadius: '50%',
        background: color,
        color: '#fff',
        fontSize: Math.round(size * 0.45),
        fontWeight: 700,
        lineHeight: 1,
        userSelect: 'none',
      }}
    >
      {initial}
    </span>
  );
}
