/**
 * AsinCatalog Component
 * 
 * Displays ALL ASINs from all sources: Product CRM, Correlations, and Influencer Tasks
 */

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import { 
  Search,
  Filter,
  Loader,
  RefreshCw,
  ExternalLink,
  CheckCircle,
  X,
  Package,
  BookOpen,
  Video,
  ClipboardList
} from 'lucide-react';

// Initialize Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_KEY;
const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

// Source badge configurations
const SOURCE_BADGES = {
  product_crm: { 
    label: 'Product CRM', 
    color: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    icon: Package
  },
  correlation: { 
    label: 'Correlation', 
    color: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    icon: BookOpen
  },
  influencer_task: { 
    label: 'Task', 
    color: 'bg-green-500/10 text-green-400 border-green-500/20',
    icon: ClipboardList
  }
};

export default function AsinCatalog() {
  const [asins, setAsins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Filters
  const [sourceFilter, setSourceFilter] = useState('all');
  const [hasVideoFilter, setHasVideoFilter] = useState('all');
  const [hasTaskFilter, setHasTaskFilter] = useState('all');

  useEffect(() => {
    loadAsinCatalog();
  }, []);

  const loadAsinCatalog = async () => {
    setLoading(true);
    try {
      // Query the asin_catalog view
      const { data, error } = await supabaseClient
        .from('asin_catalog')
        .select('*')
        .order('first_seen', { ascending: false });

      if (error) {
        console.error('Failed to load ASIN catalog:', error);
      } else {
        setAsins(data || []);
      }
    } catch (err) {
      console.error('Failed to load ASIN catalog:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filter and search ASINs
  const filteredAsins = useMemo(() => {
    return asins.filter(item => {
      // Source filter
      if (sourceFilter !== 'all' && item.source !== sourceFilter) {
        return false;
      }
      
      // Has Video filter
      if (hasVideoFilter !== 'all') {
        const shouldHaveVideo = hasVideoFilter === 'yes';
        if (item.has_video !== shouldHaveVideo) {
          return false;
        }
      }
      
      // Has Task filter
      if (hasTaskFilter !== 'all') {
        const shouldHaveTask = hasTaskFilter === 'yes';
        if (item.has_task !== shouldHaveTask) {
          return false;
        }
      }
      
      // Search filter (ASIN or title)
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesAsin = item.asin?.toLowerCase().includes(query);
        const matchesTitle = item.title?.toLowerCase().includes(query);
        if (!matchesAsin && !matchesTitle) {
          return false;
        }
      }
      
      return true;
    });
  }, [asins, sourceFilter, hasVideoFilter, hasTaskFilter, searchQuery]);

  // Count by source for filter badges
  const sourceCounts = useMemo(() => {
    const counts = { 
      all: asins.length, 
      product_crm: 0, 
      correlation: 0, 
      influencer_task: 0 
    };
    asins.forEach(item => {
      if (counts[item.source] !== undefined) {
        counts[item.source]++;
      }
    });
    return counts;
  }, [asins]);

  // Format date for display
  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-theme-primary flex items-center gap-3">
            <BookOpen className="w-6 h-6" />
            ASIN Catalog
          </h1>
          <p className="text-theme-secondary mt-1">
            {filteredAsins.length} of {asins.length} ASINs
            {searchQuery || sourceFilter !== 'all' || hasVideoFilter !== 'all' || hasTaskFilter !== 'all' 
              ? ' (filtered)' 
              : ''}
          </p>
        </div>
        <button
          onClick={loadAsinCatalog}
          disabled={loading}
          className="p-2 text-theme-secondary hover:text-accent transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Search and Filter Bar */}
      <div className="flex flex-col gap-4 mb-6">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-theme-tertiary" />
          <input
            type="text"
            placeholder="Search by ASIN or title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-10 py-2 bg-theme-surface border border-theme rounded-lg text-theme-primary placeholder-theme-tertiary focus:outline-none focus:border-accent"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-tertiary hover:text-theme-primary"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filters Row 1: Source */}
        <div className="flex gap-4 items-center">
          <span className="text-sm font-medium text-theme-secondary whitespace-nowrap">Source:</span>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setSourceFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                sourceFilter === 'all'
                  ? 'bg-accent text-white'
                  : 'bg-theme-surface border border-theme text-theme-secondary hover:text-theme-primary'
              }`}
            >
              All ({sourceCounts.all})
            </button>
            {Object.entries(SOURCE_BADGES).map(([key, { label, icon: Icon }]) => (
              <button
                key={key}
                onClick={() => setSourceFilter(key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  sourceFilter === key
                    ? 'bg-accent text-white'
                    : 'bg-theme-surface border border-theme text-theme-secondary hover:text-theme-primary'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label} ({sourceCounts[key]})
              </button>
            ))}
          </div>
        </div>

        {/* Filters Row 2: Has Video / Has Task */}
        <div className="flex gap-6">
          <div className="flex gap-2 items-center">
            <span className="text-sm font-medium text-theme-secondary whitespace-nowrap">Has Video:</span>
            <div className="flex gap-2">
              <button
                onClick={() => setHasVideoFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  hasVideoFilter === 'all'
                    ? 'bg-accent text-white'
                    : 'bg-theme-surface border border-theme text-theme-secondary hover:text-theme-primary'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setHasVideoFilter('yes')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${
                  hasVideoFilter === 'yes'
                    ? 'bg-accent text-white'
                    : 'bg-theme-surface border border-theme text-theme-secondary hover:text-theme-primary'
                }`}
              >
                <Video className="w-3.5 h-3.5" />
                Yes
              </button>
              <button
                onClick={() => setHasVideoFilter('no')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  hasVideoFilter === 'no'
                    ? 'bg-accent text-white'
                    : 'bg-theme-surface border border-theme text-theme-secondary hover:text-theme-primary'
                }`}
              >
                No
              </button>
            </div>
          </div>

          <div className="flex gap-2 items-center">
            <span className="text-sm font-medium text-theme-secondary whitespace-nowrap">Has Task:</span>
            <div className="flex gap-2">
              <button
                onClick={() => setHasTaskFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  hasTaskFilter === 'all'
                    ? 'bg-accent text-white'
                    : 'bg-theme-surface border border-theme text-theme-secondary hover:text-theme-primary'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setHasTaskFilter('yes')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${
                  hasTaskFilter === 'yes'
                    ? 'bg-accent text-white'
                    : 'bg-theme-surface border border-theme text-theme-secondary hover:text-theme-primary'
                }`}
              >
                <ClipboardList className="w-3.5 h-3.5" />
                Yes
              </button>
              <button
                onClick={() => setHasTaskFilter('no')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  hasTaskFilter === 'no'
                    ? 'bg-accent text-white'
                    : 'bg-theme-surface border border-theme text-theme-secondary hover:text-theme-primary'
                }`}
              >
                No
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && asins.length === 0 ? (
        <div className="text-center py-12">
          <Loader className="w-8 h-8 animate-spin mx-auto mb-3 text-accent" />
          <p className="text-theme-secondary">Loading catalog...</p>
        </div>
      ) : filteredAsins.length === 0 ? (
        <div className="text-center py-12 bg-theme-surface rounded-lg border border-theme">
          <div className="w-16 h-16 bg-theme-primary rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="w-8 h-8 text-theme-tertiary" />
          </div>
          <h3 className="text-lg font-medium text-theme-primary mb-1">
            {searchQuery || sourceFilter !== 'all' || hasVideoFilter !== 'all' || hasTaskFilter !== 'all' 
              ? 'No matches found' 
              : 'No ASINs yet'}
          </h3>
          <p className="text-theme-secondary">
            {searchQuery || sourceFilter !== 'all' || hasVideoFilter !== 'all' || hasTaskFilter !== 'all'
              ? 'Try adjusting your search or filters'
              : 'Import products to build your catalog'}
          </p>
        </div>
      ) : (
        /* Catalog Table */
        <div className="bg-theme-surface rounded-lg border border-theme overflow-hidden">
          {/* Header Row */}
          <div className="hidden lg:grid lg:grid-cols-12 gap-4 px-4 py-3 bg-theme-primary border-b border-theme text-sm font-medium text-theme-secondary">
            <div className="col-span-1">Image</div>
            <div className="col-span-3">Title</div>
            <div className="col-span-1">ASIN</div>
            <div className="col-span-2">Source</div>
            <div className="col-span-1 text-center">Video</div>
            <div className="col-span-1 text-center">Task</div>
            <div className="col-span-2">First Seen</div>
            <div className="col-span-1"></div>
          </div>

          {/* List Items */}
          <div className="divide-y divide-theme">
            {filteredAsins.map((item) => {
              const sourceBadge = SOURCE_BADGES[item.source] || SOURCE_BADGES.product_crm;
              const SourceIcon = sourceBadge.icon;

              return (
                <div 
                  key={`${item.asin}-${item.source}`}
                  className="grid grid-cols-1 lg:grid-cols-12 gap-4 px-4 py-3 items-center hover:bg-theme-hover transition-colors"
                >
                  {/* Image */}
                  <div className="col-span-1 flex justify-center lg:justify-start">
                    {item.image_url ? (
                      <img 
                        src={item.image_url} 
                        alt={item.title || item.asin}
                        className="w-12 h-12 object-contain bg-white rounded"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-theme-primary rounded flex items-center justify-center">
                        <Package className="w-6 h-6 text-theme-secondary" />
                      </div>
                    )}
                  </div>

                  {/* Title */}
                  <div className="col-span-3">
                    <p className="text-theme-primary line-clamp-2 text-sm">
                      {item.title || 'Title Not Available'}
                    </p>
                  </div>

                  {/* ASIN */}
                  <div className="col-span-1">
                    <span className="font-mono text-sm text-accent">{item.asin}</span>
                  </div>

                  {/* Source Badge */}
                  <div className="col-span-2">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded border ${sourceBadge.color}`}>
                      <SourceIcon className="w-3.5 h-3.5" />
                      {sourceBadge.label}
                    </span>
                  </div>

                  {/* Has Video */}
                  <div className="col-span-1 text-center">
                    {item.has_video ? (
                      <CheckCircle className="w-5 h-5 text-success inline-block" />
                    ) : (
                      <X className="w-5 h-5 text-theme-tertiary inline-block" />
                    )}
                  </div>

                  {/* Has Task */}
                  <div className="col-span-1 text-center">
                    {item.has_task ? (
                      <CheckCircle className="w-5 h-5 text-success inline-block" />
                    ) : (
                      <X className="w-5 h-5 text-theme-tertiary inline-block" />
                    )}
                  </div>

                  {/* First Seen */}
                  <div className="col-span-2">
                    <span className="text-sm text-theme-secondary">
                      {formatDate(item.first_seen)}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="col-span-1 flex justify-end">
                    <a
                      href={`https://www.amazon.com/dp/${item.asin}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:text-accent-hover"
                      title="View on Amazon"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
