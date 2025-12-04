const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const Project = require("../models/Project");
const Organization = require("../models/Organization");
const Application = require("../models/Application");

const router = express.Router();

/**
 * JWT Authentication Middleware
 * Verifies Bearer token and extracts user ID
 * Attaches req.user.id for use in routes
 */
const authenticateToken = (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Authorization token required. Format: Bearer <token>",
      });
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Attach user ID to request object
    req.user = {
      id: decoded.id || decoded.organizationId || decoded._id, // Support different token formats
    };

    if (!req.user.id) {
      return res.status(401).json({ error: "Invalid token: missing user ID" });
    }

    next();
  } catch (err) {
    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired" });
    }
    console.error("🔥 Authentication error:", err);
    return res.status(500).json({ error: "Authentication failed", details: err.message });
  }
};

/**
 * GET /api/organization/projects
 * Returns all projects for the authenticated organization
 * Response: Array of projects with { _id, project_code, project_name, status, scheduled_time, applications }
 */
router.get("/projects", authenticateToken, async (req, res) => {
  try {
    const organizationId = req.user.id;

    // Find all projects for this organization
    const projects = await Project.find({ organization_id: organizationId })
      .sort({ createdAt: -1 })
      .lean();

    // Get applications count for each project
    const projectsWithCounts = await Promise.all(
      projects.map(async (project) => {
        // Count applications for this project
        const applicationsCount = await Application.countDocuments({
          projectId: project._id,
        });

        return {
          _id: project._id.toString(),
          project_code: project.project_code,
          project_name: project.project_name,
          status: project.status || "draft",
          scheduled_time: project.scheduled_time || null,
          applications: applicationsCount,
        };
      })
    );

    res.json(projectsWithCounts);
  } catch (err) {
    console.error("🔥 GET /api/organization/projects error:", err);
    res.status(500).json({
      error: "Failed to fetch projects",
      details: err.message,
    });
  }
});

/**
 * POST /api/organization/projects
 * Creates a new project for the authenticated organization
 * Uses organization_id from JWT token (req.user.id)
 */
router.post("/projects", authenticateToken, async (req, res) => {
  try {
    const organizationId = req.user.id;
    const { project_code, project_name, description, status, scheduled_time, start_date, end_date } = req.body;

    // Validate required fields
    if (!project_code || !project_name) {
      return res.status(400).json({
        error: "project_code and project_name are required",
      });
    }

    // Ensure status is 'draft' for new projects (or use provided status)
    const projectStatus = status || "draft";

    // Parse dates if provided
    let startDate = null;
    let endDate = null;
    if (start_date) {
      startDate = new Date(start_date);
      if (isNaN(startDate.getTime())) {
        return res.status(400).json({ error: "Invalid start_date format" });
      }
    }
    if (end_date) {
      endDate = new Date(end_date);
      if (isNaN(endDate.getTime())) {
        return res.status(400).json({ error: "Invalid end_date format" });
      }
    }

    // Validate date range
    if (startDate && endDate && startDate > endDate) {
      return res.status(400).json({
        error: "start_date must be before end_date",
      });
    }

    // Create new project
    const project = await Project.create({
      organization_id: organizationId,
      project_code,
      project_name,
      description: description || "",
      status: projectStatus,
      scheduled_time: scheduled_time || null,
      start_date: startDate,
      end_date: endDate,
      // Include other optional fields if provided
      internsRequired: req.body.internsRequired || null,
      cgpaRequirement: req.body.cgpaRequirement || null,
      discipline: req.body.discipline || null,
      skills: req.body.skills || null,
      coordinatorName: req.body.coordinatorName || null,
      coordinatorEmail: req.body.coordinatorEmail || null,
      coordinatorAltEmail: req.body.coordinatorAltEmail || null,
      coordinatorPhone: req.body.coordinatorPhone || null,
      coordinatorDesignation: req.body.coordinatorDesignation || null,
      guidelinesFilePath: req.body.guidelinesFilePath || null,
    });

    res.status(201).json({
      _id: project._id.toString(),
      project_code: project.project_code,
      project_name: project.project_name,
      status: project.status,
      scheduled_time: project.scheduled_time,
      applications: 0, // New project has no applications yet
    });
  } catch (err) {
    console.error("🔥 POST /api/organization/projects error:", err);
    if (err.code === 11000) {
      return res.status(400).json({ error: "Project code already exists" });
    }
    res.status(500).json({
      error: "Failed to create project",
      details: err.message,
    });
  }
});

/**
 * PUT /api/organization/projects/:id
 * Updates an existing project
 * Only updates projects belonging to the authenticated organization
 */
router.put("/projects/:id", authenticateToken, async (req, res) => {
  try {
    const organizationId = req.user.id;
    const projectId = req.params.id;
    const { project_code, project_name, description, status, scheduled_time, start_date, end_date } = req.body;

    // Find project and verify ownership
    const project = await Project.findOne({
      _id: projectId,
      organization_id: organizationId,
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Update fields if provided
    if (project_code !== undefined) project.project_code = project_code;
    if (project_name !== undefined) project.project_name = project_name;
    if (description !== undefined) project.description = description;
    if (status !== undefined) project.status = status;
    if (scheduled_time !== undefined) project.scheduled_time = scheduled_time;

    // Update dates if provided
    if (start_date) {
      const startDate = new Date(start_date);
      if (isNaN(startDate.getTime())) {
        return res.status(400).json({ error: "Invalid start_date format" });
      }
      project.start_date = startDate;
    }
    if (end_date) {
      const endDate = new Date(end_date);
      if (isNaN(endDate.getTime())) {
        return res.status(400).json({ error: "Invalid end_date format" });
      }
      project.end_date = endDate;
    }

    // Validate date range
    if (project.start_date && project.end_date && project.start_date > project.end_date) {
      return res.status(400).json({
        error: "start_date must be before end_date",
      });
    }

    // Update other optional fields
    if (req.body.internsRequired !== undefined) project.internsRequired = req.body.internsRequired;
    if (req.body.cgpaRequirement !== undefined) project.cgpaRequirement = req.body.cgpaRequirement;
    if (req.body.discipline !== undefined) project.discipline = req.body.discipline;
    if (req.body.skills !== undefined) project.skills = req.body.skills;
    if (req.body.coordinatorName !== undefined) project.coordinatorName = req.body.coordinatorName;
    if (req.body.coordinatorEmail !== undefined) project.coordinatorEmail = req.body.coordinatorEmail;
    if (req.body.coordinatorAltEmail !== undefined) project.coordinatorAltEmail = req.body.coordinatorAltEmail;
    if (req.body.coordinatorPhone !== undefined) project.coordinatorPhone = req.body.coordinatorPhone;
    if (req.body.coordinatorDesignation !== undefined) project.coordinatorDesignation = req.body.coordinatorDesignation;
    if (req.body.guidelinesFilePath !== undefined) project.guidelinesFilePath = req.body.guidelinesFilePath;

    await project.save();

    // Get applications count
    const applicationsCount = await Application.countDocuments({
      projectId: project._id,
    });

    res.json({
      _id: project._id.toString(),
      project_code: project.project_code,
      project_name: project.project_name,
      status: project.status,
      scheduled_time: project.scheduled_time,
      applications: applicationsCount,
    });
  } catch (err) {
    console.error("🔥 PUT /api/organization/projects/:id error:", err);
    if (err.name === "CastError") {
      return res.status(400).json({ error: "Invalid project ID format" });
    }
    res.status(500).json({
      error: "Failed to update project",
      details: err.message,
    });
  }
});

/**
 * DELETE /api/organization/projects/:id
 * Deletes a project belonging to the authenticated organization
 * Also deletes all associated applications
 */
router.delete("/projects/:id", authenticateToken, async (req, res) => {
  try {
    const organizationId = req.user.id;
    const projectId = req.params.id;

    // Find project and verify ownership
    const project = await Project.findOne({
      _id: projectId,
      organization_id: organizationId,
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Delete all applications associated with this project
    await Application.deleteMany({ projectId: project._id });

    // Delete the project
    await Project.findByIdAndDelete(projectId);

    res.json({
      message: "Project deleted successfully",
      projectId: projectId,
    });
  } catch (err) {
    console.error("🔥 DELETE /api/organization/projects/:id error:", err);
    if (err.name === "CastError") {
      return res.status(400).json({ error: "Invalid project ID format" });
    }
    res.status(500).json({
      error: "Failed to delete project",
      details: err.message,
    });
  }
});

/**
 * PUT /api/organization/profile
 * Updates organization profile and password
 * Validates current password before allowing password change
 */
router.put("/profile", authenticateToken, async (req, res) => {
  try {
    const organizationId = req.user.id;
    const {
      orgName,
      cinRegistrationNumber,
      country,
      state,
      detailedAddress,
      coordinatorName,
      coordinatorDesignation,
      coordinatorEmail,
      coordinatorAlternateEmail,
      coordinatorPhone,
      currentPassword,
      newPassword,
    } = req.body;

    // Find organization
    const org = await Organization.findById(organizationId);
    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }

    // Update profile fields if provided
    if (orgName !== undefined) org.orgName = orgName;
    if (cinRegistrationNumber !== undefined) org.cinRegistrationNumber = cinRegistrationNumber;
    if (country !== undefined) org.country = country;
    if (state !== undefined) org.state = state;
    if (detailedAddress !== undefined) org.detailedAddress = detailedAddress;

    // Update coordinator information if provided
    if (
      coordinatorName !== undefined ||
      coordinatorDesignation !== undefined ||
      coordinatorEmail !== undefined ||
      coordinatorAlternateEmail !== undefined ||
      coordinatorPhone !== undefined
    ) {
      if (!org.coordinator) {
        org.coordinator = {};
      }
      if (coordinatorName !== undefined) org.coordinator.name = coordinatorName;
      if (coordinatorDesignation !== undefined) org.coordinator.designation = coordinatorDesignation;
      if (coordinatorEmail !== undefined) org.coordinator.email = coordinatorEmail;
      if (coordinatorAlternateEmail !== undefined) org.coordinator.alternateEmail = coordinatorAlternateEmail;
      if (coordinatorPhone !== undefined) org.coordinator.phone = coordinatorPhone;
    }

    // Handle password change if requested
    if (newPassword) {
      // Validate that current password is provided
      if (!currentPassword) {
        return res.status(400).json({
          error: "Current password is required to change password",
        });
      }

      // Validate current password
      const isCurrentPasswordValid = await bcrypt.compare(
        currentPassword,
        org.passwordHash || ""
      );

      if (!isCurrentPasswordValid) {
        return res.status(401).json({
          error: "Current password is incorrect",
        });
      }

      // Validate new password strength
      if (newPassword.length < 6) {
        return res.status(400).json({
          error: "New password must be at least 6 characters long",
        });
      }

      // Hash and save new password
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);
      org.passwordHash = hashedNewPassword;
    }

    // Save updated organization
    await org.save();

    res.json({
      message: "Profile updated successfully",
      organization: {
        organizationId: org._id.toString(),
        username: org.username,
        orgName: org.orgName,
        cinRegistrationNumber: org.cinRegistrationNumber,
        country: org.country,
        state: org.state,
        detailedAddress: org.detailedAddress,
        coordinator: org.coordinator,
      },
    });
  } catch (err) {
    console.error("🔥 PUT /api/organization/profile error:", err);
    res.status(500).json({
      error: "Failed to update profile",
      details: err.message,
    });
  }
});

module.exports = router;

