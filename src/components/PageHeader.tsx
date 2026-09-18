import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { CONTENT_MAX_WIDTH } from './DataPanel';
import { palette } from '../theme/palette';

export function PageHeader({
    title,
    subtitle,
    actions,
    eyebrow,
    children,
}: {
    title: string;
    subtitle?: ReactNode;
    actions?: ReactNode;
    eyebrow?: string;
    children?: ReactNode;
}) {
    return (
        <Box
            sx={{
                maxWidth: CONTENT_MAX_WIDTH,
                mx: 'auto',
                px: { xs: 2.5, md: 4 },
                pt: { xs: 2.5, md: 3.5 },
                pb: 'calc(env(safe-area-inset-bottom) + 32px)',
            }}
        >
            <Box
                sx={{
                    display: 'flex',
                    alignItems: { xs: 'flex-start', sm: 'flex-end' },
                    justifyContent: 'space-between',
                    gap: 2,
                    mb: 3.5,
                    pb: 2.5,
                    borderBottom: `1px solid ${palette.line}`,
                    flexWrap: 'wrap',
                }}
            >
                <Box sx={{ minWidth: 0, flex: '1 1 280px' }}>
                    {eyebrow && (
                        <Typography
                            variant="overline"
                            component="p"
                            sx={{
                                mb: 0.5,
                                color: palette.brandRedText,
                                fontWeight: 700,
                                letterSpacing: 0.5,
                            }}
                        >
                            {eyebrow}
                        </Typography>
                    )}
                    <Typography
                        variant="h2"
                        sx={{
                            color: palette.brandBlack,
                            fontSize: { xs: 24, md: 28 },
                            fontWeight: 700,
                            letterSpacing: -0.5,
                            lineHeight: 1.2,
                        }}
                    >
                        {title}
                    </Typography>
                    {subtitle && (
                        <Typography
                            variant="body2"
                            sx={{
                                mt: 0.75,
                                maxWidth: 720,
                                color: palette.textSecondary,
                                fontSize: 14,
                                lineHeight: 1.5,
                            }}
                        >
                            {subtitle}
                        </Typography>
                    )}
                </Box>
                {actions && <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', pb: 0.25 }}>{actions}</Box>}
            </Box>
            {children}
        </Box>
    );
}
