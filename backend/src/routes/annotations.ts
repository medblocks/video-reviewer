import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/connection.js';
import type { Annotation, AnnotationResponse, ExportData } from '../types.js';

const router = Router();

// Helper to format timestamp
function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Get all annotations for a video (by hash)
router.get('/video/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    
    const result = await pool.query<Annotation & { author_name: string }>(
      `SELECT a.*, u.name as author_name 
       FROM annotations a 
       JOIN users u ON a.user_id = u.id 
       WHERE a.video_id = $1 
       ORDER BY a.start_time ASC`,
      [videoId]
    );
    
    const annotations: AnnotationResponse[] = result.rows.map(row => ({
      id: row.id,
      video_id: row.video_id,
      parent_id: row.parent_id,
      start_time: row.start_time,
      end_time: row.end_time,
      text: row.text,
      type: row.type,
      drawing_data: row.drawing_data,
      attachments: row.attachments || [],
      status: row.status,
      created_at: row.created_at,
      author: {
        id: row.user_id,
        name: row.author_name,
      }
    }));

    res.json(annotations);
  } catch (error) {
    console.error('Error fetching annotations:', error);
    res.status(500).json({ error: 'Failed to fetch annotations' });
  }
});

// Create a new annotation
router.post('/', async (req, res) => {
  try {
    const { video_id, user_id, parent_id, start_time, end_time, text, type, drawing_data, attachments } = req.body;
    
    // Validation
    if (!video_id || !user_id || start_time === undefined || end_time === undefined || !type) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const id = uuidv4();
    const parentIdValue = parent_id || null;
    
    const result = await pool.query(
      `INSERT INTO annotations (id, video_id, user_id, parent_id, start_time, end_time, text, type, drawing_data, attachments)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [id, video_id, user_id, parentIdValue, start_time, end_time, text || '', type, drawing_data || null, JSON.stringify(attachments || [])]
    );
    
    // Fetch with author info
    const fullResult = await pool.query<Annotation & { author_name: string }>(
      `SELECT a.*, u.name as author_name 
       FROM annotations a 
       JOIN users u ON a.user_id = u.id 
       WHERE a.id = $1`,
      [id]
    );
    
    const row = fullResult.rows[0];
    const response: AnnotationResponse = {
      id: row.id,
      video_id: row.video_id,
      parent_id: row.parent_id,
      start_time: row.start_time,
      end_time: row.end_time,
      text: row.text,
      type: row.type,
      drawing_data: row.drawing_data,
      attachments: row.attachments || [],
      status: row.status,
      created_at: row.created_at,
      author: {
        id: row.user_id,
        name: row.author_name,
      }
    };

    res.status(201).json(response);
  } catch (error: any) {
    console.error('❌ Error creating annotation:', error);
    console.error('❌ Full error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    res.status(500).json({ 
      error: 'Failed to create annotation',
      details: error?.message || String(error)
    });
  }
});

// Delete an annotation
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM annotations WHERE id = $1 RETURNING id',
      [id]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Annotation not found' });
    }
    
    res.json({ success: true, id });
  } catch (error) {
    console.error('Error deleting annotation:', error);
    res.status(500).json({ error: 'Failed to delete annotation' });
  }
});

// Update an annotation
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { start_time, end_time, text, status } = req.body;
    
    // Build dynamic update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    
    if (start_time !== undefined) {
      updates.push(`start_time = $${paramIndex++}`);
      values.push(start_time);
    }
    if (end_time !== undefined) {
      updates.push(`end_time = $${paramIndex++}`);
      values.push(end_time);
    }
    if (text !== undefined) {
      updates.push(`text = $${paramIndex++}`);
      values.push(text);
    }
    if (status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(status);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    values.push(id);
    const result = await pool.query(
      `UPDATE annotations SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Annotation not found' });
    }
    
    // Fetch with author info
    const fullResult = await pool.query<Annotation & { author_name: string }>(
      `SELECT a.*, u.name as author_name 
       FROM annotations a 
       JOIN users u ON a.user_id = u.id 
       WHERE a.id = $1`,
      [id]
    );
    
    const row = fullResult.rows[0];
    const response: AnnotationResponse = {
      id: row.id,
      video_id: row.video_id,
      parent_id: row.parent_id,
      start_time: row.start_time,
      end_time: row.end_time,
      text: row.text,
      type: row.type,
      drawing_data: row.drawing_data,
      attachments: row.attachments || [],
      status: row.status,
      created_at: row.created_at,
      author: {
        id: row.user_id,
        name: row.author_name,
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error updating annotation:', error);
    res.status(500).json({ error: 'Failed to update annotation' });
  }
});

// Export annotations for a video
router.get('/export/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    
    const result = await pool.query<Annotation & { author_name: string }>(
      `SELECT a.*, u.name as author_name 
       FROM annotations a 
       JOIN users u ON a.user_id = u.id 
       WHERE a.video_id = $1 
       ORDER BY a.start_time ASC`,
      [videoId]
    );
    
    const exportData: ExportData = {
      exportVersion: '1.0',
      exportedAt: new Date().toISOString(),
      videoHash: videoId,
      annotations: result.rows.map(row => {
        const startTs = formatTimestamp(row.start_time);
        const endTs = formatTimestamp(row.end_time);
        const timestamp = row.start_time === row.end_time 
          ? startTs 
          : `${startTs} - ${endTs}`;
        
        return {
          timestamp,
          startTime: row.start_time,
          endTime: row.end_time,
          author: { id: row.user_id, name: row.author_name },
          text: row.text,
          type: row.type,
          drawingData: row.drawing_data,
          attachments: row.attachments || [],
          status: row.status,
          createdAt: row.created_at || new Date().toISOString(),
        };
      })
    };
    
    res.json(exportData);
  } catch (error) {
    console.error('Error exporting annotations:', error);
    res.status(500).json({ error: 'Failed to export annotations' });
  }
});

// Import annotations for a video
router.post('/import', async (req, res) => {
  try {
    const { videoHash, annotations, userId } = req.body;
    
    if (!videoHash || !annotations || !Array.isArray(annotations) || !userId) {
      return res.status(400).json({ error: 'Invalid import data' });
    }
    
    const imported: string[] = [];
    
    for (const ann of annotations) {
      const id = uuidv4();
      await pool.query(
        `INSERT INTO annotations (id, video_id, user_id, start_time, end_time, text, type, drawing_data, attachments)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          id,
          videoHash,
          userId, // Use the current user for imported annotations
          ann.startTime,
          ann.endTime,
          ann.text || '',
          ann.type || 'comment',
          ann.drawingData || null,
          JSON.stringify(ann.attachments || [])
        ]
      );
      imported.push(id);
    }
    
    res.status(201).json({ 
      success: true, 
      imported: imported.length,
      ids: imported 
    });
  } catch (error) {
    console.error('Error importing annotations:', error);
    res.status(500).json({ error: 'Failed to import annotations' });
  }
});

// Clear all annotations for a video
router.delete('/video/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    
    const result = await pool.query(
      'DELETE FROM annotations WHERE video_id = $1',
      [videoId]
    );
    
    res.json({ success: true, deleted: result.rowCount });
  } catch (error) {
    console.error('Error clearing annotations:', error);
    res.status(500).json({ error: 'Failed to clear annotations' });
  }
});

export default router;

