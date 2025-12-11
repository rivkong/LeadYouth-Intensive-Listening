
import React, { useState, useEffect } from 'react';
import { Plus, Library } from 'lucide-react';
import { Material } from './types';
import { ArticleCard } from './components/ArticleCard';
import { BlurReader } from './components/BlurReader';
import { ImportWizard } from './components/ImportWizard';
import { getAudioBlob, saveAudioBlob, deleteAudioBlob } from './utils/storage';

export default function App() {
  const [activeMaterial, setActiveMaterial] = useState<Material | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  
  // Import/Edit State
  const [showImport, setShowImport] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  
  const [hasLoaded, setHasLoaded] = useState(false);

  // 1. Initial Load: Metadata from LocalStorage + Audio from IndexedDB
  useEffect(() => {
    const loadData = async () => {
      try {
        const saved = localStorage.getItem('blurlisten_materials');
        if (saved) {
          const parsedMaterials: Material[] = JSON.parse(saved);
          
          // Hydrate audio URLs from IndexedDB
          const hydratedMaterials = await Promise.all(
            parsedMaterials.map(async (m) => {
              // If it's a user-imported file (starts with custom- or imp-), try to load blob
              if (m.id.startsWith('custom-') || m.id.startsWith('imp-')) {
                const blob = await getAudioBlob(m.id);
                if (blob) {
                  return { ...m, audioUrl: URL.createObjectURL(blob) };
                }
              }
              return m;
            })
          );
          setMaterials(hydratedMaterials);
        }
      } catch (e) {
        console.error("Failed to load materials", e);
      } finally {
        setHasLoaded(true);
      }
    };

    loadData();
  }, []);

  // 2. Save Metadata to LocalStorage (Avoid saving blob URLs in LS as they are temporary)
  useEffect(() => {
    if (!hasLoaded) return;
    try {
       // We strip the blob URL before saving to LS because it's useless after reload
       const toSave = materials.map(m => ({
           ...m,
           audioUrl: "" // Clear URL for storage, we rely on IDB by ID
       }));
       localStorage.setItem('blurlisten_materials', JSON.stringify(toSave));
    } catch (e) {
       console.warn("Storage quota exceeded", e);
    }
  }, [materials, hasLoaded]);

  const handleImport = async (material: Material, audioBlob: Blob | null) => {
    try {
        // If there's a new audio blob, save it.
        // If audioBlob is null (edit mode without file change), we skip saving blob
        if (audioBlob) {
            await saveAudioBlob(material.id, audioBlob);
        }
        
        let objectUrl = "";
        
        if (audioBlob) {
             objectUrl = URL.createObjectURL(audioBlob);
        } else {
             // Retrieve existing URL logic if needed, but usually we just want to update metadata
             // If we are editing and didn't provide new audio, we need to ensure the material in state has a valid URL
             // We can fetch the blob again to generate the URL for the current session
             const existingBlob = await getAudioBlob(material.id);
             if (existingBlob) {
                 objectUrl = URL.createObjectURL(existingBlob);
             }
        }

        const materialWithUrl = { ...material, audioUrl: objectUrl };
        
        setMaterials(prev => {
            const exists = prev.findIndex(m => m.id === material.id);
            if (exists !== -1) {
                // Update existing
                const updated = [...prev];
                updated[exists] = materialWithUrl;
                return updated;
            }
            // Add new
            return [materialWithUrl, ...prev];
        });
        
        setShowImport(false);
        setEditingMaterial(null);
    } catch (e) {
        alert("Failed to save audio file. Storage might be full.");
        console.error(e);
    }
  };

  const handleEdit = (e: React.MouseEvent, material: Material) => {
      e.stopPropagation();
      setEditingMaterial(material);
      setShowImport(true);
  };

  const deleteMaterial = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm("Delete this session?")) {
        await deleteAudioBlob(id);
        setMaterials(prev => prev.filter(m => m.id !== id));
    }
  };
  
  const closeWizard = () => {
      setShowImport(false);
      setEditingMaterial(null);
  };

  if (activeMaterial) {
    return <BlurReader material={activeMaterial} onBack={() => setActiveMaterial(null)} />;
  }

  // --- Spotify/Magazine Style UI ---
  return (
    <div className="min-h-screen bg-[#09090b] text-white font-sans selection:bg-[#d44c47]/30 pb-20">
      
      {/* Header / Greeting */}
      <div className="pt-12 px-6 md:px-12 max-w-7xl mx-auto">
        <header className="mb-12 border-b border-zinc-800 pb-8">
            <h1 className="text-5xl md:text-7xl font-serif italic font-bold tracking-tight text-white mb-2 flex items-center gap-3">
               LeadYouth
            </h1>
            <p className="text-zinc-500 font-sans font-medium tracking-widest text-xs uppercase ml-1">
                Intensive Listening Practice • Edition {new Date().getFullYear()}
            </p>
        </header>

        {/* Action Bar */}
        <div className="mb-12 flex justify-center">
             <button 
                 onClick={() => setShowImport(true)}
                 className="flex items-center gap-3 bg-white hover:bg-zinc-200 active:scale-95 transition-all text-black px-8 py-4 rounded-full font-serif font-bold shadow-[0_0_20px_rgba(255,255,255,0.1)] group"
              >
                 <div className="bg-black text-white p-1 rounded-full group-hover:rotate-90 transition-transform duration-500">
                    <Plus size={18} strokeWidth={3} />
                 </div>
                 <span>Create New Session</span>
              </button>
        </div>

        {/* Content Grid */}
        <main>
            {materials.length === 0 ? (
               <div className="flex flex-col items-center justify-center h-[40vh] text-zinc-600 space-y-4 animate-in fade-in zoom-in duration-500">
                  <Library size={48} strokeWidth={1} />
                  <p className="text-xl font-serif italic">Your library is empty</p>
               </div>
            ) : (
               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-8 gap-y-12">
                  {materials.map((material) => (
                      <ArticleCard 
                          key={material.id}
                          material={material} 
                          onClick={setActiveMaterial} 
                          onEdit={(e) => handleEdit(e, material)}
                          onDelete={(e) => deleteMaterial(e, material.id)}
                      />
                  ))}
               </div>
            )}
        </main>
      </div>

      {/* Import Modal */}
      {showImport && (
        <ImportWizard 
          initialData={editingMaterial || undefined}
          onClose={closeWizard} 
          onImport={handleImport}
        />
      )}
    </div>
  );
}
