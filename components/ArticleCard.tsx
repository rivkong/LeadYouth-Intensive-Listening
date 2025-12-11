import React, { useState, useMemo } from 'react';
import { Edit2, Trash2 } from 'lucide-react';
import { Material } from '../types';

interface ArticleCardProps {
  material: Material;
  onClick: (material: Material) => void;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}

// Deterministic Random Number Generator based on seed string
const mulberry32 = (a: number) => {
    return () => {
      let t = a += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
}

const strToSeed = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash);
}

// Designer Palettes
const PALETTES = [
    ['#E63946', '#F1FAEE', '#A8DADC', '#457B9D', '#1D3557'], // Americana
    ['#264653', '#2A9D8F', '#E9C46A', '#F4A261', '#E76F51'], // Earth & Sun
    ['#003049', '#D62828', '#F77F00', '#FCBF49', '#EAE2B7'], // Retro Poster
    ['#2b2d42', '#8d99ae', '#edf2f4', '#ef233c', '#d90429'], // Modernist
    ['#606c38', '#283618', '#fefae0', '#dda15e', '#bc6c25'], // Forest
];

const GenerativeArtCover: React.FC<{ title: string }> = ({ title }) => {
    const art = useMemo(() => {
        const seed = strToSeed(title);
        const rand = mulberry32(seed);
        
        // Select Palette
        const paletteIdx = Math.floor(rand() * PALETTES.length);
        const palette = PALETTES[paletteIdx];
        const bg = palette[0];
        const colors = palette.slice(1);

        // Generate Shapes
        const shapes = [];
        const numShapes = 3 + Math.floor(rand() * 5); // 3 to 7 shapes
        
        for(let i=0; i<numShapes; i++) {
            shapes.push({
                type: rand() > 0.5 ? 'circle' : 'rect',
                cx: rand() * 100,
                cy: rand() * 100,
                r: 10 + rand() * 40, // radius or width
                h: 10 + rand() * 40, // height for rect
                fill: colors[Math.floor(rand() * colors.length)],
                rotation: rand() * 360,
                opacity: 0.6 + rand() * 0.4
            });
        }
        
        return { bg, shapes, palette };
    }, [title]);

    return (
        <svg viewBox="0 0 100 125" preserveAspectRatio="xMidYMid slice" className="w-full h-full absolute inset-0">
            <defs>
                <filter id="noiseFilter">
                    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch"/>
                    <feColorMatrix type="saturate" values="0" />
                    <feComponentTransfer>
                        <feFuncA type="linear" slope="0.15" /> 
                    </feComponentTransfer>
                </filter>
            </defs>
            
            {/* Background */}
            <rect width="100%" height="100%" fill={art.bg} />
            
            {/* Abstract Shapes */}
            {art.shapes.map((s, i) => (
                s.type === 'circle' ? (
                    <circle 
                        key={i} 
                        cx={`${s.cx}%`} 
                        cy={`${s.cy}%`} 
                        r={`${s.r}%`} 
                        fill={s.fill} 
                        opacity={s.opacity}
                        style={{ mixBlendMode: 'multiply' }}
                    />
                ) : (
                    <rect 
                        key={i}
                        x={`${s.cx}%`}
                        y={`${s.cy}%`}
                        width={`${s.r}%`} // reusing r as width
                        height={`${s.h}%`}
                        fill={s.fill}
                        opacity={s.opacity}
                        transform={`rotate(${s.rotation}, ${s.cx}, ${s.cy})`}
                        style={{ mixBlendMode: 'hard-light' }}
                    />
                )
            ))}

            {/* Grain Texture Overlay */}
            <rect width="100%" height="100%" filter="url(#noiseFilter)" opacity="1" style={{ mixBlendMode: 'overlay' }}/>
            
            {/* Vignette / Shadow */}
            <rect width="100%" height="100%" fill="url(#gradientOverlay)" style={{ mixBlendMode: 'multiply' }} opacity="0.4"/>
            <defs>
                <linearGradient id="gradientOverlay" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="transparent" />
                    <stop offset="70%" stopColor="transparent" />
                    <stop offset="100%" stopColor="#000" />
                </linearGradient>
            </defs>
        </svg>
    );
}

export const ArticleCard: React.FC<ArticleCardProps> = ({ material, onClick, onEdit, onDelete }) => {
  const [imgError, setImgError] = useState(false);
  const firstLetter = material.title.charAt(0).toUpperCase();

  // Use the generative cover if no image or if image failed
  const showGenerative = !material.imageUrl || imgError;

  return (
    <div 
      onClick={() => onClick(material)}
      className="group relative cursor-pointer flex flex-col gap-4"
    >
      {/* Album Art / Cover */}
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-zinc-900 border border-zinc-800 shadow-sm transition-all duration-500 group-hover:shadow-2xl group-hover:shadow-white/5">
         
         {!showGenerative ? (
             <img 
                src={material.imageUrl} 
                alt={material.title} 
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105 opacity-90 group-hover:opacity-100 grayscale-[20%] group-hover:grayscale-0"
             />
         ) : (
             // Generative Art Fallback
             <div className="w-full h-full relative group-hover:scale-105 transition-transform duration-700 ease-out">
                <GenerativeArtCover title={material.title} />
                
                {/* Branding Overlay */}
                <div className="absolute inset-0 p-6 flex flex-col justify-between z-10">
                    <div className="flex justify-between items-center opacity-70">
                        <div className="font-bold text-[10px] tracking-[0.2em] uppercase text-white drop-shadow-md">LeadYouth</div>
                        <div className="text-[8px] text-white uppercase tracking-widest drop-shadow-md">Vol. {material.segments.length}</div>
                    </div>
                    
                    <div className="relative">
                         <div className="w-8 h-1 bg-white mb-4 shadow-sm"></div>
                         <h3 className="font-serif text-3xl text-white leading-none font-bold mix-blend-overlay opacity-50 absolute -top-4 -left-2 scale-150 origin-top-left select-none pointer-events-none truncate max-w-full">
                            {firstLetter}
                        </h3>
                         <h3 className="relative font-serif text-2xl text-white leading-tight line-clamp-4 drop-shadow-lg font-medium">
                            {material.title}
                        </h3>
                    </div>
                </div>
             </div>
         )}
         
         {/* Edit/Delete Overlay */}
         <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20">
            <button 
                onClick={onEdit}
                className="p-2 bg-white/90 text-black hover:bg-white rounded-full shadow-lg backdrop-blur-sm transition-transform hover:scale-110"
                title="Edit Session"
            >
                <Edit2 size={14} />
            </button>
            <button 
                onClick={onDelete}
                className="p-2 bg-black/50 text-white hover:bg-[#d44c47] rounded-full shadow-lg backdrop-blur-sm transition-colors"
                title="Delete"
            >
                <Trash2 size={14} />
            </button>
         </div>
      </div>

      {/* Editorial Typography */}
      <div className="flex flex-col border-t border-zinc-800 pt-3">
        <h3 className="font-serif font-bold text-white text-xl leading-tight group-hover:text-[#d44c47] transition-colors duration-300 line-clamp-2">
          {material.title}
        </h3>
        
        <div className="mt-2 flex items-center justify-between text-[10px] font-sans font-bold uppercase tracking-widest text-zinc-500">
            <span>{material.category}</span>
            <span className="flex items-center gap-1">
                {material.duration}
            </span>
        </div>
        
        <p className="mt-2 text-sm text-zinc-400 font-serif leading-relaxed line-clamp-2 opacity-0 group-hover:opacity-100 transition-opacity duration-500 h-0 group-hover:h-auto overflow-hidden">
             {material.description}
        </p>
      </div>
    </div>
  );
};